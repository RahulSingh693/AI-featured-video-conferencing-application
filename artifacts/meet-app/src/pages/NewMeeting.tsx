import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetCurrentUser,
  useCreateMeeting,
  useJoinMeetingByCode,
  getListMeetingsQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Hash, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
});

const joinSchema = z.object({
  code: z.string().min(3, "Enter a valid meeting code"),
});

export default function NewMeeting() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const createMeeting = useCreateMeeting();
  const joinByCode = useJoinMeetingByCode();

  useEffect(() => {
    if (!userLoading && !user) setLocation("/login");
  }, [user, userLoading, setLocation]);

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: "", description: "" },
  });

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: "" },
  });

  const onCreateSubmit = (values: z.infer<typeof createSchema>) => {
    createMeeting.mutate(
      { data: { title: values.title, description: values.description ?? null } },
      {
        onSuccess: (meeting) => {
          queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
          setLocation(`/meetings/${meeting.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Could not create meeting", variant: "destructive" });
        },
      },
    );
  };

  const onJoinSubmit = (values: z.infer<typeof joinSchema>) => {
    joinByCode.mutate(
      { data: { code: values.code.toUpperCase() } },
      {
        onSuccess: (meeting) => {
          setLocation(`/meetings/${meeting.id}`);
        },
        onError: () => {
          toast({ title: "Not found", description: "No meeting with that code", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Start or Join a Meeting</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create a new meeting or join an existing one with a code
          </p>
        </div>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="create" data-testid="tab-create">Create Meeting</TabsTrigger>
            <TabsTrigger value="join" data-testid="tab-join">Join Meeting</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Video className="h-5 w-5 text-primary" />
                  New Meeting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meeting Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Team Standup, Project Review..." data-testid="input-meeting-title" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="What is this meeting about?"
                              className="resize-none"
                              rows={3}
                              data-testid="input-meeting-description"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={createMeeting.isPending}
                      data-testid="button-create-meeting"
                    >
                      {createMeeting.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</>
                      ) : (
                        <><Video className="h-4 w-4" /> Start Meeting</>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="join">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hash className="h-5 w-5 text-primary" />
                  Join with Code
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...joinForm}>
                  <form onSubmit={joinForm.handleSubmit(onJoinSubmit)} className="space-y-4">
                    <FormField
                      control={joinForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meeting Code</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="ABC-DEF-GHI"
                              className="font-mono text-center tracking-widest uppercase text-lg"
                              data-testid="input-meeting-code"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={joinByCode.isPending}
                      data-testid="button-join-meeting"
                    >
                      {joinByCode.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Joining...</>
                      ) : (
                        "Join Meeting"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
