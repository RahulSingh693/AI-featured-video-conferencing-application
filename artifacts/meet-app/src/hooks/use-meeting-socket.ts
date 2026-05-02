import { useEffect, useState, useCallback } from "react";
import { getSocket, type ParticipantPresence } from "@/lib/socket";

interface UseMeetingSocketOptions {
  meetingId: number;
  userId: number;
  name: string;
  avatar: string | null;
  enabled: boolean;
  onMeetingEnded?: () => void;
}

export function useMeetingSocket({
  meetingId,
  userId,
  name,
  avatar,
  enabled,
  onMeetingEnded,
}: UseMeetingSocketOptions) {
  const [participants, setParticipants] = useState<Map<number, ParticipantPresence>>(new Map());
  const [connected, setConnected] = useState(false);

  const updateStatus = useCallback(
    (isMuted?: boolean, isVideoOff?: boolean) => {
      if (!enabled) return;
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("participant:status", { meetingId, userId, isMuted, isVideoOff });
      }
    },
    [meetingId, userId, enabled],
  );

  useEffect(() => {
    if (!enabled || !meetingId || !userId) return;

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit("meeting:join", { meetingId, userId, name, avatar });
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onRoomState = ({ participants: list }: { participants: ParticipantPresence[] }) => {
      setParticipants(new Map(list.map((p) => [p.userId, p])));
    };

    const onParticipantJoined = (p: ParticipantPresence) => {
      setParticipants((prev) => new Map(prev).set(p.userId, p));
    };

    const onParticipantLeft = ({ userId: leftId }: { userId: number }) => {
      setParticipants((prev) => {
        const next = new Map(prev);
        next.delete(leftId);
        return next;
      });
    };

    const onParticipantUpdated = (data: {
      userId: number;
      attentionScore?: number;
      isMuted?: boolean;
      isVideoOff?: boolean;
    }) => {
      setParticipants((prev) => {
        const existing = prev.get(data.userId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(data.userId, {
          ...existing,
          ...(data.attentionScore !== undefined && { attentionScore: data.attentionScore }),
          ...(data.isMuted !== undefined && { isMuted: data.isMuted }),
          ...(data.isVideoOff !== undefined && { isVideoOff: data.isVideoOff }),
        });
        return next;
      });
    };

    const onMeetingEnded = () => {
      onMeetingEnded?.();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("participant:joined", onParticipantJoined);
    socket.on("participant:left", onParticipantLeft);
    socket.on("participant:updated", onParticipantUpdated);
    socket.on("meeting:ended", onMeetingEnded);

    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit("meeting:join", { meetingId, userId, name, avatar });
      setConnected(true);
    }

    return () => {
      socket.emit("meeting:leave", { meetingId, userId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("participant:joined", onParticipantJoined);
      socket.off("participant:left", onParticipantLeft);
      socket.off("participant:updated", onParticipantUpdated);
      socket.off("meeting:ended", onMeetingEnded);
    };
  }, [meetingId, userId, name, avatar, enabled, onMeetingEnded]);

  return { participants, connected, updateStatus };
}
