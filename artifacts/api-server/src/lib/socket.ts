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

type SignalData =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit | null };

export interface ServerToClientEvents {
  "participant:joined": (data: ParticipantPresence) => void;
  "participant:left": (data: { userId: number }) => void;
  "participant:updated": (data: { userId: number; attentionScore?: number; isMuted?: boolean; isVideoOff?: boolean }) => void;
  "meeting:ended": (data: { meetingId: number }) => void;
  "room:state": (data: { participants: ParticipantPresence[] }) => void;
  "webrtc:signal": (data: { fromUserId: number; signal: SignalData }) => void;
  "webrtc:new-peer": (data: { userId: number; name: string }) => void;
}

export interface ClientToServerEvents {
  "meeting:join": (data: { meetingId: number; userId: number; name: string; avatar: string | null }) => void;
  "meeting:leave": (data: { meetingId: number; userId: number }) => void;
  "participant:status": (data: { meetingId: number; userId: number; isMuted?: boolean; isVideoOff?: boolean }) => void;
  "webrtc:signal": (data: { meetingId: number; targetUserId: number; signal: SignalData }) => void;
}

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

const meetingRooms = new Map<number, Map<number, ParticipantPresence>>();

// socketId -> userId
const socketUserMap = new Map<string, number>();

// meetingId -> (userId -> socketId) — for routing WebRTC signals
const meetingSocketMap = new Map<number, Map<number, string>>();

function getMeetingSocketMap(meetingId: number): Map<number, string> {
  if (!meetingSocketMap.has(meetingId)) {
    meetingSocketMap.set(meetingId, new Map());
  }
  return meetingSocketMap.get(meetingId)!;
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("meeting:join", ({ meetingId, userId, name, avatar }) => {
      const roomName = `meeting:${meetingId}`;
      socket.join(roomName);

      socketUserMap.set(socket.id, userId);

      const socketsInMeeting = getMeetingSocketMap(meetingId);

      // Notify existing participants so they can initiate WebRTC offers to the new peer
      if (socketsInMeeting.size > 0) {
        socket.to(roomName).emit("webrtc:new-peer", { userId, name });
      }

      socketsInMeeting.set(userId, socket.id);

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
        socketUserMap.delete(socket.id);
        socketsInMeeting.delete(userId);
        if (socketsInMeeting.size === 0) meetingSocketMap.delete(meetingId);

        room.delete(userId);
        io?.to(roomName).emit("participant:left", { userId });
        if (room.size === 0) meetingRooms.delete(meetingId);
        logger.info({ meetingId, userId }, "Participant disconnected from meeting room");
      });
    });

    socket.on("meeting:leave", ({ meetingId, userId }) => {
      const roomName = `meeting:${meetingId}`;
      socket.leave(roomName);

      socketUserMap.delete(socket.id);
      meetingSocketMap.get(meetingId)?.delete(userId);
      if (meetingSocketMap.get(meetingId)?.size === 0) meetingSocketMap.delete(meetingId);

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

    socket.on("webrtc:signal", ({ meetingId, targetUserId, signal }) => {
      const fromUserId = socketUserMap.get(socket.id);
      if (fromUserId === undefined) return;

      const targetSocketId = meetingSocketMap.get(meetingId)?.get(targetUserId);
      if (!targetSocketId) {
        logger.warn({ meetingId, targetUserId }, "WebRTC signal: target socket not found");
        return;
      }

      io?.to(targetSocketId).emit("webrtc:signal", { fromUserId, signal });
      logger.info({ meetingId, fromUserId, targetUserId, signalType: signal.type }, "WebRTC signal relayed");
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
