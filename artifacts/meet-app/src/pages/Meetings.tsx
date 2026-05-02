import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useGetCurrentUser, useListMeetings, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, Plus, Search, Users, Clock, BrainCircuit } from "lucide-react";
import { format, parseISO } from "date-fns";

function statusColor(status: string) {
  if (status === "active") return "bg-green-500/15 text-green-600 border-green-500/20";
  if (status === "ended") return "bg-muted text-muted-foreground border-border";
  return "bg-blue-500/15 text-blue-600 border-blue-500/20";
}

export default function Meetings() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "ended" | "scheduled">("all");

  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const { data: meetings, isLoading } = useListMeetings();

  useEffect(() => {
    if (!userLoading && !user) setLocation("/login");
  }, [user, userLoading, setLocation]);

  const filtered = (meetings ?? []).filter((m) => {
    const matchSearch =
      search === "" ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.hostName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || m.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex-1 container max-w-screen-xl mx-auto px-4 md:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meetings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {meetings?.length ?? 0} meetings found
          </p>
        </div>
        <Link href="/meetings/new">
          <Button className="gap-2" data-testid="button-new-meeting">
            <Plus className="h-4 w-4" /> New Meeting
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-meetings"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["all", "active", "scheduled", "ended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                filter === f
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filter-${f}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Meetings List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Video className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-foreground font-medium">No meetings found</p>
            <p className="text-muted-foreground text-sm mt-1">
              {search ? "Try a different search term" : "Create your first meeting to get started"}
            </p>
            {!search && (
              <Link href="/meetings/new">
                <Button size="sm" className="mt-4 gap-2" data-testid="button-create-first">
                  <Plus className="h-4 w-4" /> Create Meeting
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={m.status === "ended" ? `/meetings/${m.id}/summary` : `/meetings/${m.id}`}
            >
              <Card
                className="border border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
                data-testid={`card-meeting-${m.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        m.status === "active" ? "bg-green-500 animate-pulse" :
                        m.status === "ended" ? "bg-muted-foreground" : "bg-blue-500"
                      }`} />
                      <div>
                        <h3 className="font-semibold text-foreground">{m.title}</h3>
                        {m.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{m.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {m.participantCount} participants
                          </span>
                          {m.startedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(parseISO(m.startedAt), "MMM d, yyyy HH:mm")}
                            </span>
                          )}
                          <span>Host: {m.hostName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-shrink-0">
                      <Badge className={`border text-xs ${statusColor(m.status)}`} variant="outline">
                        {m.status}
                      </Badge>
                      {m.status === "active" && (
                        <Button size="sm" className="gap-2" data-testid={`button-join-${m.id}`}>
                          <Video className="h-3 w-3" /> Join
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
