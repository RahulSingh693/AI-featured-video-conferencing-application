import { io, type Socket } from "socket.io-client";

export interface ParticipantPresence {
  userId: number;
  name: string;
  avatar: string | null;
  joinedAt: string;
  attentionScore: number | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

export type SignalData =
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

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    const base = import.meta.env.BASE_URL ?? "/";
    socket = io({
      path: `${base}api/socket.io`.replace(/\/+/g, "/"),
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
}
