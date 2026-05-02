import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, LogOut, LayoutDashboard, Calendar, Plus } from "lucide-react";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        // Clear entire query cache so stale user data is gone immediately
        queryClient.clear();
        setLocation("/");
      },
    });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4 md:px-8">
        <Link href={user ? "/dashboard" : "/"} className="flex items-center space-x-2 mr-6">
          <Video className="h-6 w-6 text-primary" />
          <span className="hidden font-bold sm:inline-block">
            Synapse Meet
          </span>
        </Link>

        {user && (
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link 
              href="/dashboard" 
              className={`transition-colors hover:text-foreground/80 ${location === "/dashboard" ? "text-foreground" : "text-foreground/60"}`}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </div>
            </Link>
            <Link 
              href="/meetings" 
              className={`transition-colors hover:text-foreground/80 ${location === "/meetings" ? "text-foreground" : "text-foreground/60"}`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Meetings</span>
              </div>
            </Link>
          </nav>
        )}

        <div className="flex flex-1 items-center justify-end space-x-2">
          {!isLoading && (
            <nav className="flex items-center space-x-2">
              {user ? (
                <div className="flex items-center gap-4">
                  <Link href="/meetings/new">
                    <Button size="sm" className="gap-2" data-testid="button-new-meeting-nav">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">New Meeting</span>
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage src={user.avatar || undefined} alt={user.name} />
                      <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <Button variant="ghost" size="icon" onClick={handleLogout} disabled={logout.isPending} data-testid="button-logout">
                      <LogOut className="h-4 w-4" />
                      <span className="sr-only">Log out</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" data-testid="link-login">
                      Log in
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm" data-testid="link-register">
                      Sign up
                    </Button>
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
