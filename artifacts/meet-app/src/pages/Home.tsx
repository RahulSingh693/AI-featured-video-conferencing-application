import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Video, BrainCircuit, BarChart3, Users, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Skeleton className="h-[400px] w-[800px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 flex justify-center items-center relative overflow-hidden bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
        <div className="container px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center space-y-8 text-center">
            <div className="space-y-4 max-w-3xl">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none text-foreground">
                Meetings that <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Understand You</span>
              </h1>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-2xl/relaxed">
                Synapse Meet combines professional video conferencing with AI-powered attention tracking, real-time analytics, and automated summaries.
              </p>
            </div>
            <div className="space-x-4 flex items-center">
              <Link href="/register">
                <Button size="lg" className="h-12 px-8 font-medium gap-2" data-testid="btn-get-started">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-12 px-8 font-medium" data-testid="btn-login-hero">
                  Log In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/30 flex justify-center border-t border-border">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="flex flex-col items-center text-center space-y-4 p-6 bg-card rounded-2xl shadow-sm border border-border">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <BrainCircuit className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-card-foreground">Attention Tracking</h3>
              <p className="text-muted-foreground">
                Our AI tracks engagement in real-time, providing actionable insights to keep your team focused and productive.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4 p-6 bg-card rounded-2xl shadow-sm border border-border">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <BarChart3 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-card-foreground">Deep Analytics</h3>
              <p className="text-muted-foreground">
                Visualize performance over time with beautiful charts showing participation rates, duration, and engagement trends.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4 p-6 bg-card rounded-2xl shadow-sm border border-border">
              <div className="p-4 bg-primary/10 rounded-full text-primary">
                <Video className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-card-foreground">Crystal Clear Video</h3>
              <p className="text-muted-foreground">
                Enterprise-grade video infrastructure ensures you look and sound your best, no matter where you are.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
