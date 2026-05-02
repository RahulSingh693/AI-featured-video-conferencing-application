import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, meetingsTable, participantsTable, usersTable, attentionRecordsTable } from "@workspace/db";
import {
  CreateMeetingBody,
  GetMeetingParams,
  JoinMeetingParams,
  JoinMeetingByCodeBody,
  EndMeetingParams,
  GetMeetingSummaryParams,
  GetMeetingParticipantsParams,
  RecordAttentionBody,
  RecordAttentionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import { generateMeetingCode } from "../lib/code-gen";
import { broadcastMeetingEnded, updateParticipantAttention, getMeetingChatLog } from "../lib/socket";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function formatMeeting(
  meeting: typeof meetingsTable.$inferSelect,
  hostName: string,
  participantCount: number,
) {
  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    code: meeting.code,
    hostId: meeting.hostId,
    hostName,
    status: meeting.status,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    participantCount,
    createdAt: meeting.createdAt.toISOString(),
  };
}

router.get("/meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const hostedMeetings = await db
    .select({
      meeting: meetingsTable,
      hostName: usersTable.name,
      participantCount: sql<number>`count(${participantsTable.id})::int`,
    })
    .from(meetingsTable)
    .leftJoin(usersTable, eq(meetingsTable.hostId, usersTable.id))
    .leftJoin(participantsTable, eq(meetingsTable.id, participantsTable.meetingId))
    .where(eq(meetingsTable.hostId, userId))
    .groupBy(meetingsTable.id, usersTable.name)
    .orderBy(desc(meetingsTable.createdAt));

  const attendedMeetingIds = await db
    .select({ meetingId: participantsTable.meetingId })
    .from(participantsTable)
    .where(eq(participantsTable.userId, userId));

  const attendedIds = attendedMeetingIds.map((r) => r.meetingId);

  const attendedMeetings =
    attendedIds.length === 0
      ? []
      : await db
          .select({
            meeting: meetingsTable,
            hostName: usersTable.name,
            participantCount: sql<number>`count(${participantsTable.id})::int`,
          })
          .from(meetingsTable)
          .leftJoin(usersTable, eq(meetingsTable.hostId, usersTable.id))
          .leftJoin(participantsTable, eq(meetingsTable.id, participantsTable.meetingId))
          .where(sql`${meetingsTable.id} = ANY(ARRAY[${sql.join(attendedIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
          .groupBy(meetingsTable.id, usersTable.name)
          .orderBy(desc(meetingsTable.createdAt));

  // Merge and deduplicate
  const seen = new Set<number>();
  const all = [...hostedMeetings, ...attendedMeetings].filter((m) => {
    if (seen.has(m.meeting.id)) return false;
    seen.add(m.meeting.id);
    return true;
  });

  res.json(
    all.map((m) => formatMeeting(m.meeting, m.hostName ?? "", m.participantCount ?? 0)),
  );
});

router.post("/meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const code = generateMeetingCode();
  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      code,
      hostId: userId,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  // Add host as participant
  await db.insert(participantsTable).values({
    meetingId: meeting.id,
    userId,
    joinTime: new Date(),
  });

  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  res.status(201).json(formatMeeting(meeting, host?.name ?? "", 1));
});

router.post("/meetings/join-by-code", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const parsed = JoinMeetingByCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.code, parsed.data.code))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  // Check if already a participant
  const existing = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(participantsTable).values({
      meetingId: meeting.id,
      userId,
      joinTime: new Date(),
    });
  }

  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, meeting.hostId)).limit(1);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  res.json(formatMeeting(meeting, host?.name ?? "", count ?? 0));
});

router.get("/meetings/:meetingId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const params = GetMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, meeting.hostId)).limit(1);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  const avgResult = await db
    .select({ avg: sql<number>`avg(${participantsTable.attentionScore})` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  const myParticipant = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.userId, userId)))
    .limit(1);

  res.json({
    ...formatMeeting(meeting, host?.name ?? "", count ?? 0),
    avgAttentionScore: avgResult[0]?.avg ?? null,
    transcript: meeting.transcript,
    myAttentionScore: myParticipant[0]?.attentionScore ?? null,
    myJoinTime: myParticipant[0]?.joinTime?.toISOString() ?? null,
    myLeaveTime: myParticipant[0]?.leaveTime?.toISOString() ?? null,
  });
});

router.post("/meetings/:meetingId/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const params = JoinMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  // Add participant if not already joined
  const existing = await db
    .select()
    .from(participantsTable)
    .where(and(eq(participantsTable.meetingId, meeting.id), eq(participantsTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(participantsTable).values({
      meetingId: meeting.id,
      userId,
      joinTime: new Date(),
    });
  }

  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, meeting.hostId)).limit(1);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  res.json(formatMeeting(meeting, host?.name ?? "", count ?? 0));
});

router.post("/meetings/:meetingId/end", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const params = EndMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  if (meeting.hostId !== userId) {
    res.status(403).json({ error: "Only the host can end the meeting" });
    return;
  }

  const endedAt = new Date();

  // Gather participants + attention scores for the AI prompt
  const participantRows = await db
    .select({ name: usersTable.name, attentionScore: participantsTable.attentionScore })
    .from(participantsTable)
    .innerJoin(usersTable, eq(participantsTable.userId, usersTable.id))
    .where(eq(participantsTable.meetingId, meeting.id));

  const durationMinutes = Math.round((endedAt.getTime() - new Date(meeting.createdAt).getTime()) / 60000);

  // Chat messages logged in-memory during the meeting
  const chatLog = getMeetingChatLog(meeting.id);
  const chatSection = chatLog.length > 0
    ? chatLog.map((m) => `[${m.name}]: ${m.text}`).join("\n")
    : "No chat messages during this meeting.";

  const participantSection = participantRows
    .map((p) => `- ${p.name} (attention: ${p.attentionScore != null ? `${Math.round(Number(p.attentionScore))}%` : "N/A"})`)
    .join("\n");

  // Generate AI summary
  let summary: string;
  let keyPoints: string;
  let actionItems: string;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are a professional meeting assistant that generates concise, structured meeting summaries.
Always respond with valid JSON matching exactly this shape:
{
  "summary": "2-3 sentence professional narrative summary",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "actionItems": ["action 1", "action 2", "action 3"]
}`,
        },
        {
          role: "user",
          content: `Generate a meeting summary for the following meeting:

Title: ${meeting.title}
Duration: ${durationMinutes} minute(s)
Participants (${participantRows.length}):
${participantSection}

Chat transcript:
${chatSection}

Produce a professional summary with 4-5 key discussion points and 3-4 concrete action items. Base them on the chat content if available, otherwise infer reasonable points for a meeting with this title. Keep the tone professional and concise.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    summary = parsed?.summary ?? `"${meeting.title}" was conducted successfully with ${participantRows.length} participant(s) over ${durationMinutes} minute(s).`;
    keyPoints = JSON.stringify(Array.isArray(parsed?.keyPoints) ? parsed.keyPoints : ["Meeting objectives covered", "Team updates shared", "Next steps agreed"]);
    actionItems = JSON.stringify(Array.isArray(parsed?.actionItems) ? parsed.actionItems : ["Schedule follow-up meeting", "Share notes with all participants"]);
  } catch (err) {
    // Fallback if AI unavailable
    summary = `"${meeting.title}" concluded with ${participantRows.length} participant(s) over ${durationMinutes} minute(s). Key topics were discussed and action items assigned.`;
    keyPoints = JSON.stringify(["Meeting objectives discussed", "Team updates shared", "Next steps agreed upon", "Follow-up actions assigned"]);
    actionItems = JSON.stringify(["Schedule follow-up meeting within a week", "Share meeting notes with all participants", "Complete assigned tasks before next meeting"]);
  }

  const [updated] = await db
    .update(meetingsTable)
    .set({
      status: "ended",
      endedAt,
      summary,
      keyPoints,
      actionItems,
    })
    .where(eq(meetingsTable.id, params.data.meetingId))
    .returning();

  // Update all participants' leave time
  await db
    .update(participantsTable)
    .set({ leaveTime: endedAt })
    .where(and(eq(participantsTable.meetingId, meeting.id)));

  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, meeting.hostId)).limit(1);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  // Notify all participants in the room that the meeting ended
  broadcastMeetingEnded(params.data.meetingId);

  res.json(formatMeeting(updated, host?.name ?? "", count ?? 0));
});

router.get("/meetings/:meetingId/summary", requireAuth, async (req, res): Promise<void> => {
  const params = GetMeetingSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  const avgResult = await db
    .select({ avg: sql<number>`avg(${participantsTable.attentionScore})` })
    .from(participantsTable)
    .where(eq(participantsTable.meetingId, meeting.id));

  let durationMinutes: number | null = null;
  if (meeting.startedAt && meeting.endedAt) {
    durationMinutes = Math.round(
      (meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000,
    );
  }

  const keyPoints = meeting.keyPoints ? (JSON.parse(meeting.keyPoints) as string[]) : [];
  const actionItems = meeting.actionItems ? (JSON.parse(meeting.actionItems) as string[]) : [];

  res.json({
    meetingId: meeting.id,
    title: meeting.title,
    summary: meeting.summary,
    keyPoints,
    actionItems,
    transcript: meeting.transcript,
    duration: durationMinutes,
    participantCount: count ?? 0,
    avgAttentionScore: avgResult[0]?.avg ?? null,
  });
});

router.get("/meetings/:meetingId/participants", requireAuth, async (req, res): Promise<void> => {
  const params = GetMeetingParticipantsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, params.data.meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  const participants = await db
    .select({
      participant: participantsTable,
      user: usersTable,
    })
    .from(participantsTable)
    .innerJoin(usersTable, eq(participantsTable.userId, usersTable.id))
    .where(eq(participantsTable.meetingId, params.data.meetingId));

  res.json(
    participants.map(({ participant, user }) => ({
      id: participant.id,
      userId: participant.userId,
      name: user.name,
      avatar: user.avatar,
      joinTime: participant.joinTime?.toISOString() ?? null,
      leaveTime: participant.leaveTime?.toISOString() ?? null,
      attentionScore: participant.attentionScore,
      isHost: meeting.hostId === participant.userId,
    })),
  );
});

router.post("/meetings/:meetingId/attention", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const params = RecordAttentionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bodyParsed = RecordAttentionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const { score } = bodyParsed.data;

  // Insert attention record
  await db.insert(attentionRecordsTable).values({
    meetingId: params.data.meetingId,
    userId,
    score,
  });

  // Update rolling average for participant
  const avgResult = await db
    .select({ avg: sql<number>`avg(${attentionRecordsTable.score})` })
    .from(attentionRecordsTable)
    .where(
      and(
        eq(attentionRecordsTable.meetingId, params.data.meetingId),
        eq(attentionRecordsTable.userId, userId),
      ),
    );

  const avgScore = avgResult[0]?.avg ?? score;

  await db
    .update(participantsTable)
    .set({ attentionScore: avgScore })
    .where(
      and(
        eq(participantsTable.meetingId, params.data.meetingId),
        eq(participantsTable.userId, userId),
      ),
    );

  // Broadcast updated attention score to all participants in real time
  updateParticipantAttention(params.data.meetingId, userId, avgScore);

  res.json({ message: "Attention recorded" });
});

export default router;
