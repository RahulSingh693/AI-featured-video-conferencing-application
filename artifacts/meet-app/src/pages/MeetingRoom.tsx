import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetCurrentUser,
  useGetMeeting,
  useGetMeetingParticipants,
  useEndMeeting,
  useRecordAttention,
  getGetMeetingQueryKey,
  getGetMeetingParticipantsQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  Users, Copy, BrainCircuit, Crown, Wifi,
} from "lucide-react";

const COLORS = [
  "bg-violet-600", "bg-blue-600", "bg-cyan-600", "bg-emerald-600",
  "bg-orange-600", "bg-rose-600", "bg-indigo-600", "bg-teal-600",
];

function ParticipantTile({
  name,
  isSelf,
  isHost,
  attentionScore,
  colorIndex,
  videoRef,
  isMuted,
  isVideoOff,
}: {
  name: string;
  isSelf?: boolean;
  isHost?: boolean;
  attentionScore?: number | null;
  colorIndex: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isMuted?: boolean;
  isVideoOff?: boolean;
}) {
  const color = COLORS[colorIndex % COLORS.length];
  return (
    <div className="relative rounded-xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center border border-white/10">
      {isSelf && videoRef && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"
        />
      ) : (
        <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white text-2xl font-bold`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {/* Overlay labels */}
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
        <div className="absolute top-2 right-2 text-xs font-bold bg-black/60 text-cyan-400 px-2 py-0.5 rounded-md backdrop-blur-sm">
          {attentionScore.toFixed(0)}%
        </div>
      )}
      {isMuted && (
        <div className="absolute top-2 left-2 bg-red-500/80 rounded-full p-1 backdrop-blur-sm">
          <MicOff className="h-3 w-3 text-white" />
        </div>
      )}
      {/* Simulated speaking animation */}
      {!isSelf && (
        <div className="absolute inset-0 rounded-xl border-2 border-transparent" />
      )}
    </div>
  );
}

export default function MeetingRoom() {
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const { data: meeting, isLoading: meetingLoading } = useGetMeeting(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetMeetingQueryKey(meetingId) },
  });
  const { data: participants } = useGetMeetingParticipants(meetingId, {
    query: {
      enabled: !!meetingId,
      queryKey: getGetMeetingParticipantsQueryKey(meetingId),
      refetchInterval: 10000,
    },
  });

  const endMeeting = useEndMeeting();
  const recordAttention = useRecordAttention();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [attentionScore, setAttentionScore] = useState<number>(82);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cameraError, setCameraError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attentionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request camera access
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (active) setCameraError(true);
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Meeting timer
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Attention tracking — simulate and submit every 30s
  useEffect(() => {
    if (!meetingId || !user) return;

    const sendAttention = () => {
      const score = Math.min(100, Math.max(40, attentionScore + (Math.random() * 10 - 5)));
      setAttentionScore(Math.round(score));
      if (!isMuted && !isVideoOff) {
        recordAttention.mutate({ meetingId, data: { score: Math.round(score) } });
      }
    };

    attentionIntervalRef.current = setInterval(sendAttention, 30000);
    return () => {
      if (attentionIntervalRef.current) clearInterval(attentionIntervalRef.current);
    };
  }, [meetingId, user, isMuted, isVideoOff, attentionScore, recordAttention]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    }
    setIsMuted((v) => !v);
  }, [isMuted]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((t) => { t.enabled = isVideoOff; });
    }
    setIsVideoOff((v) => !v);
  }, [isVideoOff]);

  const handleEndLeave = useCallback(() => {
    const isHost = meeting?.hostId === user?.id;
    if (isHost) {
      endMeeting.mutate(
        { meetingId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMeetingQueryKey(meetingId) });
            streamRef.current?.getTracks().forEach((t) => t.stop());
            setLocation(`/meetings/${meetingId}/summary`);
          },
          onError: () => {
            toast({ title: "Error", description: "Could not end the meeting", variant: "destructive" });
          },
        },
      );
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setLocation("/dashboard");
    }
  }, [meeting, user, meetingId, endMeeting, queryClient, setLocation, toast]);

  const copyCode = () => {
    if (meeting?.code) {
      navigator.clipboard.writeText(meeting.code).then(() => {
        toast({ title: "Copied!", description: "Meeting code copied to clipboard" });
      });
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
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/meetings")}>
            Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  const isHost = meeting.hostId === user?.id;
  const otherParticipants = (participants ?? []).filter((p) => p.userId !== user?.id);

  // Build video grid: self + others (real + simulated to fill)
  const tiles = [
    { id: -1, name: user?.name ?? "You", isSelf: true, isHost, attentionScore, colorIndex: 0 },
    ...otherParticipants.slice(0, 5).map((p, i) => ({
      id: p.id,
      name: p.name,
      isSelf: false,
      isHost: p.isHost,
      attentionScore: p.attentionScore,
      colorIndex: i + 1,
    })),
  ];

  const gridCols =
    tiles.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" :
    tiles.length === 2 ? "grid-cols-2" :
    tiles.length <= 4 ? "grid-cols-2" :
    "grid-cols-3";

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-3.5rem)] bg-zinc-950 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white font-medium text-sm truncate max-w-[200px]">{meeting.title}</span>
          </div>
          <span className="text-zinc-400 text-xs font-mono">{formatTime(elapsedSeconds)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors border border-white/10"
            data-testid="button-copy-code"
          >
            <Copy className="h-3 w-3" />
            {meeting.code}
          </button>
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border ${
              showParticipants
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10"
            }`}
            data-testid="button-toggle-participants"
          >
            <Users className="h-3 w-3" />
            {(participants?.length ?? 1)}
          </button>
        </div>
      </div>

      {/* Main area */}
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
                videoRef={tile.isSelf ? videoRef : undefined}
                isMuted={tile.isSelf ? isMuted : false}
                isVideoOff={tile.isSelf ? isVideoOff : false}
              />
            ))}
          </div>
        </div>

        {/* Participants Panel */}
        {showParticipants && (
          <div className="w-64 bg-zinc-900 border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-white font-medium text-sm">Participants ({participants?.length ?? 1})</h3>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {/* Self */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {user?.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{user?.name} (You)</p>
                  {isHost && <p className="text-yellow-400 text-xs">Host</p>}
                </div>
                <div className="text-cyan-400 text-xs font-bold">{attentionScore}%</div>
              </div>
              {/* Others */}
              {(participants ?? [])
                .filter((p) => p.userId !== user?.id)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-violet-600 text-white">
                        {p.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{p.name}</p>
                      {p.isHost && <p className="text-yellow-400 text-xs">Host</p>}
                    </div>
                    {p.attentionScore != null && (
                      <div className="text-cyan-400 text-xs font-bold">
                        {p.attentionScore.toFixed(0)}%
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Attention Score Bar */}
      <div className="px-4 py-2 bg-zinc-900/60 border-t border-white/5 flex items-center gap-3">
        <BrainCircuit className="h-4 w-4 text-cyan-400 flex-shrink-0" />
        <span className="text-zinc-400 text-xs">Attention</span>
        <div className="flex-1 bg-zinc-800 rounded-full h-1.5 max-w-xs">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-primary transition-all duration-1000"
            style={{ width: `${attentionScore}%` }}
          />
        </div>
        <span className="text-cyan-400 text-xs font-bold">{attentionScore}%</span>
        <div className="ml-auto flex items-center gap-1 text-green-400 text-xs">
          <Wifi className="h-3 w-3" />
          <span>Live</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-center gap-3 p-4 bg-zinc-900 border-t border-white/10">
        <button
          onClick={toggleMute}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${
            isMuted ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          data-testid="button-toggle-mute"
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span className="text-xs">{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        <button
          onClick={toggleVideo}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${
            isVideoOff ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"
          }`}
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
          onClick={() => setShowParticipants((v) => !v)}
          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${
            showParticipants ? "bg-primary/20 text-primary" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          data-testid="button-participants-ctrl"
        >
          <Users className="h-5 w-5" />
          <span className="text-xs">People</span>
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
