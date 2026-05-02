import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetCurrentUser,
  useGetDashboardStats,
  useGetDashboardAnalytics,
  useGetRecentMeetings,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Video, Users, BrainCircuit, Clock, Plus, ArrowRight,
  TrendingUp, Calendar, Zap,
} from "lucide-react";
import { format, parseISO } from "date-fns";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  color = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    green: "bg-green-500/10 text-green-500",
    orange: "bg-orange-500/10 text-orange-500",
  };
  return (
    <Card className="border border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-2" />
            ) : (
              <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function statusColor(status: string) {
  if (status === "active") return "bg-green-500/15 text-green-600 border-green-500/20";
  if (status === "ended") return "bg-muted text-muted-foreground border-border";
  return "bg-blue-500/15 text-blue-600 border-blue-500/20";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: analytics, isLoading: analyticsLoading } = useGetDashboardAnalytics();
  const { data: recentMeetings, isLoading: recentLoading } = useGetRecentMeetings();

  useEffect(() => {
    if (!userLoading && !user) {
      setLocation("/login");
    }
  }, [user, userLoading, setLocation]);

  if (userLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Skeleton className="h-64 w-full max-w-4xl rounded-2xl" />
      </div>
    );
  }

  const avgAttention =
    stats?.avgAttentionScore != null ? `${stats.avgAttentionScore.toFixed(1)}%` : "—";
  const bestAttention =
    stats?.bestAttentionScore != null ? `${stats.bestAttentionScore.toFixed(1)}%` : "—";

  return (
    <div className="flex-1 container max-w-screen-xl mx-auto px-4 md:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            {user?.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Here's your meeting performance at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/meetings/new">
            <Button className="gap-2" data-testid="button-new-meeting-dashboard">
              <Plus className="h-4 w-4" />
              New Meeting
            </Button>
          </Link>
          <Link href="/meetings">
            <Button variant="outline" className="gap-2" data-testid="button-view-all-meetings">
              <Calendar className="h-4 w-4" />
              All Meetings
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Video}
          label="Total Meetings"
          value={stats?.totalMeetings ?? 0}
          sub={`${stats?.thisMonthMeetings ?? 0} this month`}
          loading={statsLoading}
          color="primary"
        />
        <StatCard
          icon={BrainCircuit}
          label="Avg Attention Score"
          value={avgAttention}
          sub={`Best: ${bestAttention}`}
          loading={statsLoading}
          color="accent"
        />
        <StatCard
          icon={Users}
          label="Total Participants"
          value={stats?.totalParticipants ?? 0}
          sub="across hosted meetings"
          loading={statsLoading}
          color="green"
        />
        <StatCard
          icon={Clock}
          label="Total Duration"
          value={`${stats?.totalDurationMinutes ?? 0}m`}
          sub={`${stats?.totalMeetingsHosted ?? 0} hosted meetings`}
          loading={statsLoading}
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Weekly Activity</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics?.weeklyActivity ?? []}>
                  <defs>
                    <linearGradient id="colorMeetings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => format(parseISO(v), "EEE")}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="meetings"
                    name="Meetings"
                    stroke="hsl(var(--primary))"
                    fill="url(#colorMeetings)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Meetings by Month */}
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Meetings by Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics?.meetingsByMonth ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" name="Meetings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attention Trend */}
      <Card className="border border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Attention Score Trend</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={analytics?.attentionTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="meetingTitle"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Attention %"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--accent))", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Meetings */}
      <Card className="border border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Meetings</CardTitle>
            <Link href="/meetings">
              <Button variant="ghost" size="sm" className="gap-1 text-xs" data-testid="button-all-meetings">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !recentMeetings || recentMeetings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Video className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No meetings yet. Start one now!</p>
              <Link href="/meetings/new">
                <Button size="sm" className="mt-3 gap-2" data-testid="button-start-first-meeting">
                  <Plus className="h-4 w-4" /> Start Meeting
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMeetings.map((m) => (
                <Link key={m.id} href={m.status === "ended" ? `/meetings/${m.id}/summary` : `/meetings/${m.id}`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent hover:border-border"
                    data-testid={`row-meeting-${m.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.status === "active" ? "bg-green-500" : m.status === "ended" ? "bg-muted-foreground" : "bg-blue-500"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.hostName} · {m.participantCount} participants
                          {m.startedAt ? ` · ${format(parseISO(m.startedAt), "MMM d")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      {m.attentionScore != null && (
                        <div className="text-xs font-medium text-accent">
                          {m.attentionScore.toFixed(0)}%
                        </div>
                      )}
                      <Badge className={`text-xs border ${statusColor(m.status)} font-medium`} variant="outline">
                        {m.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
