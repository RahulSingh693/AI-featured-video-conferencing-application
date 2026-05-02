import { useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  useGetCurrentUser,
  useGetMeetingSummary,
  useGetMeetingParticipants,
  getGetMeetingSummaryQueryKey,
  getGetMeetingParticipantsQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BrainCircuit, Users, Clock, CheckCircle2,
  ListChecks, FileText, ArrowLeft, ChevronRight,
} from "lucide-react";

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? "#06b6d4" : score >= 60 ? "#8b5cf6" : "#f59e0b";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-sm font-bold text-foreground">{score.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function MeetingSummary() {
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();

  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const { data: summary, isLoading: summaryLoading } = useGetMeetingSummary(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetMeetingSummaryQueryKey(meetingId) },
  });
  const { data: participants, isLoading: participantsLoading } = useGetMeetingParticipants(meetingId, {
    query: { enabled: !!meetingId, queryKey: getGetMeetingParticipantsQueryKey(meetingId) },
  });

  useEffect(() => {
    if (!userLoading && !user) setLocation("/login");
  }, [user, userLoading, setLocation]);

  const isLoading = summaryLoading || participantsLoading;

  return (
    <div className="flex-1 container max-w-screen-lg mx-auto px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/meetings">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-meetings">
            <ArrowLeft className="h-4 w-4" /> Meetings
          </Button>
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Meeting Summary</span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : !summary ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Summary not available for this meeting.</p>
        </div>
      ) : (
        <>
          {/* Meeting Title + Stats */}
          <Card className="border border-border bg-gradient-to-br from-card to-primary/5">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <Badge className="mb-3 bg-green-500/15 text-green-600 border-green-500/20" variant="outline">
                    Ended
                  </Badge>
                  <h1 className="text-2xl font-bold text-foreground">{summary.title}</h1>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {summary.participantCount} participants
                    </span>
                    {summary.duration != null && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {summary.duration} minutes
                      </span>
                    )}
                  </div>
                </div>
                {summary.avgAttentionScore != null && (
                  <div className="flex flex-col items-center gap-1">
                    <ScoreRing score={summary.avgAttentionScore} size={80} />
                    <span className="text-xs text-muted-foreground">Avg Attention</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Summary + Points */}
            <div className="lg:col-span-2 space-y-4">
              {/* AI Summary */}
              {summary.summary && (
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      AI Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed">{summary.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Key Points */}
              {summary.keyPoints.length > 0 && (
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      Key Discussion Points
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summary.keyPoints.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <div className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                            {i + 1}
                          </div>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Action Items */}
              {summary.actionItems.length > 0 && (
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ListChecks className="h-4 w-4 text-primary" />
                      Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {summary.actionItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Transcript */}
              {summary.transcript && (
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Transcript
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded-lg">
                      {summary.transcript}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: Participants */}
            <div>
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Participants
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(participants ?? []).map((p) => (
                      <div key={p.id} className="flex items-center gap-3" data-testid={`participant-${p.userId}`}>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {p.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          {p.isHost && (
                            <p className="text-xs text-yellow-500">Host</p>
                          )}
                        </div>
                        {p.attentionScore != null && (
                          <div className="text-right">
                            <p className="text-xs font-bold text-accent">{p.attentionScore.toFixed(0)}%</p>
                            <p className="text-xs text-muted-foreground">attention</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="mt-4 space-y-2">
                <Link href="/dashboard">
                  <Button className="w-full gap-2" data-testid="button-go-dashboard">
                    <BrainCircuit className="h-4 w-4" /> View Analytics
                  </Button>
                </Link>
                <Link href="/meetings/new">
                  <Button variant="outline" className="w-full gap-2" data-testid="button-new-meeting-summary">
                    Start New Meeting
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
