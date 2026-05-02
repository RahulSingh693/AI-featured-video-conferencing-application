import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket, type ChatMessage } from "@/lib/socket";

interface UseMeetingChatOptions {
  meetingId: number;
  enabled: boolean;
  isPanelOpen: boolean;
}

export function useMeetingChat({ meetingId, enabled, isPanelOpen }: UseMeetingChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const isPanelOpenRef = useRef(isPanelOpen);

  useEffect(() => {
    isPanelOpenRef.current = isPanelOpen;
    if (isPanelOpen) setUnreadCount(0);
  }, [isPanelOpen]);

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!isPanelOpenRef.current) {
        setUnreadCount((n) => n + 1);
      }
    };

    socket.on("chat:message", onMessage);
    return () => { socket.off("chat:message", onMessage); };
  }, [enabled]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !enabled) return;
      getSocket().emit("chat:message", { meetingId, text: trimmed });
    },
    [meetingId, enabled],
  );

  return { messages, unreadCount, sendMessage };
}
