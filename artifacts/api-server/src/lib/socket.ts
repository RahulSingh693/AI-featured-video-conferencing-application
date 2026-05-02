import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

export interface ParticipantPresence {
  userId: number;
  name: string;
  avatar: string | null;
  joinedAt: string;
  attentionScore: number | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

export interface ServerToClientEvents {
  "participant:joined": (data: ParticipantPresence) => void;
  "participant:left": (data: { userId: number }) => void;
  "participant:updated": (data: { userId: number; attentionScore?: number; isMuted?: boolean; isVideoOff?: boolean }) => void;
  "meeting:ended": (data: { meetingId: number }) => void;
  "room:state": (data: { participants: ParticipantPresence[] }) => void;
}

export interface ClientToServerEvents {
  "meeting:join": (data: { meetingId: number; userId: number; name: string; avatar: string | null }) => void;
  "meeting:leave": (data: { meetingId: number; userId: number }) => void;
  "participant:status": (data: { meetingId: number; userId: number; isMuted?: boolean; isVideoOff?: boolean }) => void;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

const meetingRooms = new Map<number, Map<number, ParticipantPresence>>();

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("meeting:join", ({ meetingId, userId, name, avatar }) => {
      const roomName = `meeting:${meetingId}`;
      socket.join(roomName);

      if (!meetingRooms.has(meetingId)) {
        meetingRooms.set(meetingId, new Map());
      }
      const room = meetingRooms.get(meetingId)!;

      const presence: ParticipantPresence = {
        userId,
        name,
        avatar,
        joinedAt: new Date().toISOString(),
        attentionScore: null,
        isMuted: false,
        isVideoOff: false,
      };
      room.set(userId, presence);

      socket.to(roomName).emit("participant:joined", presence);

      socket.emit("room:state", { participants: Array.from(room.values()) });

      logger.info({ meetingId, userId, name }, "Participant joined meeting room");

      socket.on("disconnect", () => {
        room.delete(userId);
        io?.to(roomName).emit("participant:left", { userId });
        if (room.size === 0) meetingRooms.delete(meetingId);
        logger.info({ meetingId, userId }, "Participant disconnected from meeting room");
      });
    });

    socket.on("meeting:leave", ({ meetingId, userId }) => {
      const roomName = `meeting:${meetingId}`;
      socket.leave(roomName);

      const room = meetingRooms.get(meetingId);
      if (room) {
        room.delete(userId);
        io?.to(roomName).emit("participant:left", { userId });
        if (room.size === 0) meetingRooms.delete(meetingId);
      }

      logger.info({ meetingId, userId }, "Participant left meeting room");
    });

    socket.on("participant:status", ({ meetingId, userId, isMuted, isVideoOff }) => {
      const room = meetingRooms.get(meetingId);
      if (room?.has(userId)) {
        const p = room.get(userId)!;
        if (isMuted !== undefined) p.isMuted = isMuted;
        if (isVideoOff !== undefined) p.isVideoOff = isVideoOff;
        room.set(userId, p);
      }
      io?.to(`meeting:${meetingId}`).emit("participant:updated", { userId, isMuted, isVideoOff });
    });
  });

  return io;
}

export function emitToMeeting<K extends keyof ServerToClientEvents>(
  meetingId: number,
  event: K,
  data: Parameters<ServerToClientEvents[K]>[0],
) {
  if (!io) return;
  (io.to(`meeting:${meetingId}`) as ReturnType<typeof io.to>).emit(event, data as never);
}

export function updateParticipantAttention(meetingId: number, userId: number, attentionScore: number) {
  const room = meetingRooms.get(meetingId);
  if (room?.has(userId)) {
    const p = room.get(userId)!;
    p.attentionScore = attentionScore;
    room.set(userId, p);
  }
  if (!io) return;
  io.to(`meeting:${meetingId}`).emit("participant:updated", { userId, attentionScore });
}

export function broadcastMeetingEnded(meetingId: number) {
  if (!io) return;
  io.to(`meeting:${meetingId}`).emit("meeting:ended", { meetingId });
  meetingRooms.delete(meetingId);
}

export { io };
