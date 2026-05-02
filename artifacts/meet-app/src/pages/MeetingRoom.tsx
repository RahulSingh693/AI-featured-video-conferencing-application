import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetCurrentUser,
  useGetMeeting,
  useEndMeeting,
  useRecordAttention,
  getGetMeetingQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useMeetingSocket } from "@/hooks/use-meeting-socket";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useMeetingChat } from "@/hooks/use-meeting-chat";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  Users, Copy, BrainCircuit, Crown, Wifi, WifiOff,
  MessageSquare, Send, Hand,
} from "lucide-react";

const COLORS = [
  "bg-violet-600", "bg-blue-600", "bg-cyan-600", "bg-emerald-600",
  "bg-orange-600", "bg-rose-600", "bg-indigo-600", "bg-teal-600",
];

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />;
}

function ParticipantTile({
  name, isSelf, isHost, attentionScore, colorIndex,
  localVideoRef, stream, isMuted, isVideoOff, isHandRaised,
}: {
  name: string;
  isSelf?: boolean;
  isHost?: boolean;
  attentionScore?: number | null;
  colorIndex: number;
  localVideoRef?: React.RefObject<HTMLVideoElement | null>;
  stream?: MediaStream | null;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isHandRaised?: boolean;
}) {
  const color = COLORS[colorIndex % COLORS.length];
  const showLocalVideo = isSelf && !!localVideoRef && !isVideoOff;
  const showRemoteVideo = !isSelf && !!stream;
  return (
    <div className={`relative rounded-xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center border transition-all duration-300 ${isHandRaised ? "border-yellow-400/70 shadow-[0_0_16px_rgba(250,204,21,0.25)]" : "border-white/10"}`}>
      {showLocalVideo ? (
        <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
      ) : showRemoteVideo ? (
        <RemoteVideo stream={stream!} />
      ) : (
        <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white text-2xl font-bold`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Raised hand badge */}
      {isHandRaised && (
        <div className="absolute top-2 right-2 bg-yellow-400 rounded-full w-7 h-7 flex items-center justify-center shadow-lg animate-bounce">
          <span className="text-sm leading-none">✋</span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        <span className="text-xs text-white font-medium bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
          {name}{isSelf ? " (You)" : ""}
        </span>
        {isHost && (
          <span className="text-xs text-yellow-400 bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
            <Crown className="h-2.5 w-2.5" /> Host
          </span>
        )}
      </div>
      {attentionScore != null && (
        <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1 ${
          attentionScore >= 75 ? "bg-emerald-900/80 text-emerald-400" :
          attentionScore >= 50 ? "bg-yellow-900/80 text-yellow-400" :
          "bg-red-900/80 text-red-400"
        }`}>
          <BrainCircuit className="h-2.5 w-2.5" />
          {attentionScore.toFixed(0)}%
        </div>
      )}
      {isMuted && (
        <div className="absolute bottom-8 left-2 bg-red-500/80 rounded-full p-1 backdrop-blur-sm">
          <MicOff className="h-3 w-3 text-white" />
        </div>
      )}
      {!isSelf && stream && (
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
      )}
    </div>
  );
}

function formatChatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MeetingRoom() {
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() },
  });
  const { data: meeting, isLoading: meetingLoading } = useGetMeeting(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetMeetingQueryKey(meetingId) },
  });

  const endMeeting = useEndMeeting();
  const recordAttention = useRecordAttention();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [attentionScore, setAttentionScore] = useState<number>(82);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attentionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isHost = meeting?.hostId === user?.id;
  const socketEnabled = !!user && !!meetingId;

  const handleMeetingEndedByHost = useCallback(() => {
    if (!isHost) {
      toast({ title: "Meeting ended", description: "The host has ended this meeting." });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setLocation(`/meetings/${meetingId}/summary`);
    }
  }, [isHost, meetingId, setLocation, toast]);

  const handleHandRaised = useCallback(
    (raisedUserId: number, raisedName: string) => {
      if (isHost) {
        toast({
          title: "✋ Hand Raised",
          description: `${raisedName} wants to speak`,
          duration: 5000,
        });
      }
    },
    [isHost, toast],
  );

  const { participants: socketParticipants, connected, updateStatus, toggleHand } = useMeetingSocket({
    meetingId,
    userId: user?.id ?? 0,
    name: user?.name ?? "",
    avatar: user?.avatar ?? null,
    enabled: socketEnabled,
    onMeetingEnded: handleMeetingEndedByHost,
    onHandRaised: handleHandRaised,
  });

  const handleToggleHand = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    toggleHand();
  }, [isHandRaised, toggleHand]);

  const { remoteStreams } = useWebRTC({
    meetingId,
    myUserId: user?.id ?? 0,
    localStream,
    enabled: socketEnabled,
  });

  const { messages, unreadCount, sendMessage } = useMeetingChat({
    meetingId,
    enabled: socketEnabled,
    isPanelOpen: showChat,
  });

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (showChat) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showChat]);

  // Camera + mic
  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(() => {});
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Timer
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, []);

  // Attention tracking — simulates AI gaze/engagement scoring every 8 s
  useEffect(() => {
    if (!meetingId || !user) return;
    const sendAttention = () => {
      setAttentionScore((prev) => {
        // Baseline shifts based on A/V state
        const baseline = isMuted && isVideoOff ? 38 : isVideoOff ? 58 : isMuted ? 70 : 80;
        // Random walk toward baseline with occasional spikes/dips
        const drift = (Math.random() * 18 - 9);           // ±9 random noise
        const pull  = (baseline - prev) * 0.18;           // regression to baseline
        const next  = Math.min(100, Math.max(10, Math.round(prev + drift + pull)));
        recordAttention.mutate({ meetingId, data: { score: next } });
        return next;
      });
    };
    sendAttention(); // immediate first reading
    attentionIntervalRef.current = setInterval(sendAttention, 8000);
    return () => { if (attentionIntervalRef.current) clearInterval(attentionIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, user?.id, isMuted, isVideoOff]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMuted(next);
    updateStatus(next, isVideoOff);
  }, [isMuted, isVideoOff, updateStatus]);

  const toggleVideo = useCallback(() => {
    const next = !isVideoOff;
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setIsVideoOff(next);
    updateStatus(isMuted, next);
  }, [isVideoOff, isMuted, updateStatus]);

  const handleEndLeave = useCallback(() => {
    if (isHost) {
      endMeeting.mutate({ meetingId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(meetingId) });
          streamRef.current?.getTracks().forEach((t) => t.stop());
          setLocation(`/meetings/${meetingId}/summary`);
        },
        onError: () => toast({ title: "Error", description: "Could not end the meeting", variant: "destructive" }),
      });
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setLocation("/dashboard");
    }
  }, [isHost, meetingId, endMeeting, queryClient, setLocation, toast]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    sendMessage(chatInput);
    setChatInput("");
  }, [chatInput, sendMessage]);

  const handleChatKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const copyCode = () => {
    if (meeting?.code) {
      navigator.clipboard.writeText(meeting.code).then(() =>
        toast({ title: "Copied!", description: "Meeting code copied to clipboard" }),
      );
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!userLoading && !user) setLocation("/login");
  }, [user, userLoading, setLocation]);

  if (meetingLoading || userLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <Skeleton className="h-96 w-full max-w-4xl rounded-2xl" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <p className="text-lg font-medium">Meeting not found</p>
          <button className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-sm" onClick={() => setLocation("/meetings")}>
            Back to Meetings
          </button>
        </div>
      </div>
    );
  }

  const socketList = Array.from(socketParticipants.values()).filter((p) => p.userId !== user?.id);
  const participantCount = socketParticipants.size || 1;
  const webrtcConnected = remoteStreams.size > 0;

  // Room-average attention across all participants with a score
  const allScores = [
    attentionScore,
    ...socketList.map((p) => p.attentionScore).filter((s): s is number => s != null),
  ];
  const roomAttention = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);

  const tiles = [
    { id: -1, name: user?.name ?? "You", isSelf: true, isHost, attentionScore, isMuted, isVideoOff, isHandRaised, colorIndex: 0, stream: null as MediaStream | null },
    ...socketList.slice(0, 5).map((p, i) => ({
      id: p.userId, name: p.name, isSelf: false,
      isHost: meeting.hostId === p.userId,
      attentionScore: p.attentionScore,
      isMuted: p.isMuted, isVideoOff: p.isVideoOff, isHandRaised: p.isHandRaised,
      colorIndex: i + 1,
      stream: remoteStreams.get(p.userId) ?? null,
    })),
  ];

  const gridCols =
    tiles.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" :
    tiles.length === 2 ? "grid-cols-2" :
    tiles.length <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-3.5rem)] bg-zinc-950 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white font-medium text-sm truncate max-w-[200px]">{meeting.title}</span>
          </div>
          <span className="text-zinc-400 text-xs font-mono">{formatTime(elapsedSeconds)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${connected ? "text-green-400 bg-green-500/10" : "text-zinc-500 bg-zinc-800"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            <span>{connected ? "Live" : "Connecting…"}</span>
          </div>
          {webrtcConnected && (
            <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-cyan-400 bg-cyan-500/10">
              <Video className="h-3 w-3" />
              <span>P2P</span>
            </div>
          )}
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors border border-white/10"
          >
            <Copy className="h-3 w-3" />
            {meeting.code}
          </button>
          <button
            onClick={() => { setShowParticipants((v) => !v); setShowChat(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border ${showParticipants ? "bg-primary/20 text-primary border-primary/30" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10"}`}
          >
            <Users className="h-3 w-3" />
            {participantCount}
          </button>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4 overflow-auto">
          <div className={`grid ${gridCols} gap-3 h-full content-center`}>
            {tiles.map((tile) => (
              <ParticipantTile
                key={tile.id}
                name={tile.name}
                isSelf={tile.isSelf}
                isHost={tile.isHost}
                attentionScore={tile.attentionScore}
                colorIndex={tile.colorIndex}
                localVideoRef={tile.isSelf ? localVideoRef : undefined}
                stream={tile.stream}
                isMuted={tile.isMuted}
                isVideoOff={tile.isVideoOff}
                isHandRaised={tile.isHandRaised}
              />
            ))}
          </div>
        </div>

        {/* ── Participants Panel ── */}
        {showParticipants && (
          <div className="w-64 bg-zinc-900 border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Participants ({participantCount})</h3>
              {connected && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              <div className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${isHandRaised ? "bg-yellow-400/10 border-yellow-400/30" : "bg-white/5 border-white/10"}`}>
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{user?.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{user?.name} (You)</p>
                  {isHost && <p className="text-yellow-400 text-xs">Host</p>}
                </div>
                <div className="flex items-center gap-1">
                  {isHandRaised && <span className="text-sm">✋</span>}
                  {isMuted && <MicOff className="h-3 w-3 text-red-400" />}
                  {isVideoOff && <VideoOff className="h-3 w-3 text-red-400" />}
                  <span className="text-cyan-400 text-xs font-bold">{attentionScore}%</span>
                </div>
              </div>
              {socketList.map((p) => (
                <div key={p.userId} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${p.isHandRaised ? "bg-yellow-400/10 border-yellow-400/30" : "bg-white/5 border-white/10"}`}>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-violet-600 text-white">{p.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{p.name}</p>
                    <div className="flex items-center gap-1">
                      {meeting.hostId === p.userId && <span className="text-yellow-400 text-xs">Host</span>}
                      {remoteStreams.has(p.userId) && (
                        <span className="text-cyan-400 text-xs flex items-center gap-0.5">
                          <Video className="h-2.5 w-2.5" /> Live
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.isHandRaised && <span className="text-sm">✋</span>}
                    {p.isMuted && <MicOff className="h-3 w-3 text-red-400" />}
                    {p.isVideoOff && <VideoOff className="h-3 w-3 text-red-400" />}
                    {p.attentionScore != null && (
                      <span className="text-cyan-400 text-xs font-bold">{p.attentionScore.toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              ))}
              {socketList.length === 0 && (
                <p className="text-zinc-500 text-xs text-center py-4">
                  You're alone in this meeting.<br />Share the code to invite others.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Chat Panel ── */}
        {showChat && (
          <div className="w-72 bg-zinc-900 border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Meeting Chat
              </h3>
              {connected && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <MessageSquare className="h-8 w-8 text-zinc-700 mb-2" />
                  <p className="text-zinc-500 text-xs">No messages yet.</p>
                  <p className="text-zinc-600 text-xs mt-1">Say hello!</p>
                </div>
              )}
              {messages.map((msg) => {
                const isMine = msg.userId === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                    {!isMine && (
                      <span className="text-zinc-500 text-xs px-1">{msg.name}</span>
                    )}
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-zinc-800 text-zinc-100 rounded-tl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-zinc-600 text-[10px] px-1">{formatChatTime(msg.timestamp)}</span>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl border border-white/10 px-3 py-2 focus-within:border-primary/50 transition-colors">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Message everyone…"
                  maxLength={500}
                  className="flex-1 bg-transparent text-white text-xs placeholder:text-zinc-500 outline-none min-w-0"
                  data-testid="chat-input"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className="text-primary hover:text-primary/80 disabled:text-zinc-600 transition-colors flex-shrink-0"
                  data-testid="chat-send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-zinc-600 text-[10px] mt-1 text-right">{chatInput.length}/500 · Enter to send</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Attention Bar ── */}
      <div className="px-4 py-2 bg-zinc-900/60 border-t border-white/5 flex items-center gap-3">
        {/* Pulsing AI tracking badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </div>
          <BrainCircuit className="h-4 w-4 text-cyan-400" />
          <span className="text-zinc-400 text-xs hidden sm:inline">AI Tracking</span>
        </div>

        {/* My score */}
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 text-xs">You</span>
          <span className={`text-xs font-bold ${attentionScore >= 75 ? "text-emerald-400" : attentionScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
            {attentionScore}%
          </span>
        </div>

        {/* Room average bar */}
        <div className="flex-1 flex items-center gap-2 max-w-sm">
          <span className="text-zinc-500 text-xs flex-shrink-0">Room avg</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                roomAttention >= 75 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                roomAttention >= 50 ? "bg-gradient-to-r from-yellow-500 to-yellow-400" :
                "bg-gradient-to-r from-red-500 to-red-400"
              }`}
              style={{ width: `${roomAttention}%` }}
            />
          </div>
          <span className={`text-xs font-bold flex-shrink-0 ${roomAttention >= 75 ? "text-emerald-400" : roomAttention >= 50 ? "text-yellow-400" : "text-red-400"}`}>
            {roomAttention}%
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1 text-xs">
          {connected
            ? <><Wifi className="h-3 w-3 text-green-400" /><span className="text-green-400">Live</span></>
            : <><WifiOff className="h-3 w-3 text-zinc-500" /><span className="text-zinc-500">Offline</span></>}
        </div>
      </div>

      {/* ── Controls Bar ── */}
      <div className="flex items-center justify-center gap-3 p-4 bg-zinc-900 border-t border-white/10">
        <button
          onClick={toggleMute}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${isMuted ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
          data-testid="button-toggle-mute"
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span className="text-xs">{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        <button
          onClick={toggleVideo}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${isVideoOff ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
          data-testid="button-toggle-video"
        >
          {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          <span className="text-xs">{isVideoOff ? "Start Video" : "Stop Video"}</span>
        </button>

        <button
          className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          onClick={() => toast({ title: "Screen Share", description: "Screen sharing coming soon" })}
          data-testid="button-screen-share"
        >
          <Monitor className="h-5 w-5" />
          <span className="text-xs">Share</span>
        </button>

        <button
          onClick={() => { setShowParticipants((v) => !v); setShowChat(false); }}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${showParticipants ? "bg-primary/20 text-primary" : "bg-white/10 text-white hover:bg-white/20"}`}
          data-testid="button-participants-ctrl"
        >
          <Users className="h-5 w-5" />
          <span className="text-xs">People</span>
        </button>

        {/* Chat button with unread badge */}
        {/* Raise Hand */}
        <button
          onClick={handleToggleHand}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 ${
            isHandRaised
              ? "bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30 ring-1 ring-yellow-400/50"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
          data-testid="button-raise-hand"
        >
          <Hand className="h-5 w-5" />
          <span className="text-xs">{isHandRaised ? "Lower" : "Raise"}</span>
        </button>

        <button
          onClick={() => { setShowChat((v) => !v); setShowParticipants(false); }}
          className={`relative flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${showChat ? "bg-primary/20 text-primary" : "bg-white/10 text-white hover:bg-white/20"}`}
          data-testid="button-chat"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-xs">Chat</span>
          {unreadCount > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={handleEndLeave}
          className="flex flex-col items-center gap-1 p-3 px-6 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors ml-4"
          disabled={endMeeting.isPending}
          data-testid="button-end-leave"
        >
          <PhoneOff className="h-5 w-5" />
          <span className="text-xs">{isHost ? "End" : "Leave"}</span>
        </button>
      </div>
    </div>
  );
}
