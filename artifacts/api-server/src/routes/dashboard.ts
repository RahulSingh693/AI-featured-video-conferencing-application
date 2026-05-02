import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db, meetingsTable, participantsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [hostedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetingsTable)
    .where(eq(meetingsTable.hostId, userId));

  const attendedRows = await db
    .select({ meetingId: participantsTable.meetingId })
    .from(participantsTable)
    .where(eq(participantsTable.userId, userId));

  const attendedMeetingIds = attendedRows.map((r) => r.meetingId);
  const totalMeetings = new Set(attendedMeetingIds).size;

  const avgAttentionResult = await db
    .select({ avg: sql<number>`avg(${participantsTable.attentionScore})` })
    .from(participantsTable)
    .where(eq(participantsTable.userId, userId));

  const bestAttentionResult = await db
    .select({ max: sql<number>`max(${participantsTable.attentionScore})` })
    .from(participantsTable)
    .where(eq(participantsTable.userId, userId));

  // Total unique participants in hosted meetings
  const participantsInHostedMeetings = await db
    .select({ count: sql<number>`count(distinct ${participantsTable.userId})::int` })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .where(eq(meetingsTable.hostId, userId));

  // Total duration of meetings attended
  const durationResult = await db
    .select({
      totalMinutes: sql<number>`sum(extract(epoch from (${meetingsTable.endedAt} - ${meetingsTable.startedAt})) / 60)::int`,
    })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .where(
      and(
        eq(participantsTable.userId, userId),
      ),
    );

  // This month meetings
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonthResult = await db
    .select({ count: sql<number>`count(distinct ${participantsTable.meetingId})::int` })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .where(
      and(
        eq(participantsTable.userId, userId),
        gte(meetingsTable.createdAt, startOfMonth),
      ),
    );

  res.json({
    totalMeetings,
    totalMeetingsHosted: hostedCount?.count ?? 0,
    totalMeetingsAttended: totalMeetings,
    avgAttentionScore: avgAttentionResult[0]?.avg ?? null,
    totalParticipants: participantsInHostedMeetings[0]?.count ?? 0,
    totalDurationMinutes: durationResult[0]?.totalMinutes ?? 0,
    thisMonthMeetings: thisMonthResult[0]?.count ?? 0,
    bestAttentionScore: bestAttentionResult[0]?.max ?? null,
  });
});

router.get("/dashboard/analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  // Last 7 days activity
  const days: { date: string; meetings: number; attentionScore: number | null; participants: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const meetingsOnDay = await db
      .select({ count: sql<number>`count(distinct ${participantsTable.meetingId})::int` })
      .from(participantsTable)
      .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
      .where(
        and(
          eq(participantsTable.userId, userId),
          gte(meetingsTable.createdAt, day),
          sql`${meetingsTable.createdAt} <= ${dayEnd}`,
        ),
      );

    const avgAttention = await db
      .select({ avg: sql<number>`avg(${participantsTable.attentionScore})` })
      .from(participantsTable)
      .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
      .where(
        and(
          eq(participantsTable.userId, userId),
          gte(meetingsTable.createdAt, day),
          sql`${meetingsTable.createdAt} <= ${dayEnd}`,
        ),
      );

    days.push({
      date: day.toISOString().split("T")[0],
      meetings: meetingsOnDay[0]?.count ?? 0,
      attentionScore: avgAttention[0]?.avg ?? null,
      participants: 0,
    });
  }

  // Last 5 meetings attention trend
  const recentMeetings = await db
    .select({
      title: meetingsTable.title,
      date: meetingsTable.createdAt,
      score: participantsTable.attentionScore,
    })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .where(eq(participantsTable.userId, userId))
    .orderBy(desc(meetingsTable.createdAt))
    .limit(10);

  const attentionTrend = recentMeetings.map((r) => ({
    meetingTitle: r.title,
    date: r.date.toISOString().split("T")[0],
    score: r.score,
  }));

  // Meetings by month (last 6 months)
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${meetingsTable.createdAt}, 'Mon YYYY')`,
      count: sql<number>`count(distinct ${participantsTable.meetingId})::int`,
    })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .where(
      and(
        eq(participantsTable.userId, userId),
        gte(meetingsTable.createdAt, new Date(new Date().setMonth(new Date().getMonth() - 6))),
      ),
    )
    .groupBy(sql`to_char(${meetingsTable.createdAt}, 'Mon YYYY'), date_trunc('month', ${meetingsTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${meetingsTable.createdAt})`);

  // Participation rate: percentage of sessions where user had attention score > 70
  const totalWithScore = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(and(eq(participantsTable.userId, userId)));

  const highAttention = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participantsTable)
    .where(
      and(
        eq(participantsTable.userId, userId),
        sql`${participantsTable.attentionScore} > 70`,
      ),
    );

  const total = totalWithScore[0]?.count ?? 1;
  const high = highAttention[0]?.count ?? 0;
  const participationRate = total > 0 ? (high / total) * 100 : 0;

  res.json({
    weeklyActivity: days,
    attentionTrend: attentionTrend.reverse(),
    meetingsByMonth: monthlyData,
    participationRate,
  });
});

router.get("/dashboard/recent-meetings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      meeting: meetingsTable,
      hostName: usersTable.name,
      myAttentionScore: participantsTable.attentionScore,
    })
    .from(participantsTable)
    .innerJoin(meetingsTable, eq(participantsTable.meetingId, meetingsTable.id))
    .innerJoin(usersTable, eq(meetingsTable.hostId, usersTable.id))
    .where(eq(participantsTable.userId, userId))
    .orderBy(desc(meetingsTable.createdAt))
    .limit(10);

  const result = await Promise.all(
    rows.map(async ({ meeting, hostName, myAttentionScore }) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(participantsTable)
        .where(eq(participantsTable.meetingId, meeting.id));

      let durationMinutes: number | null = null;
      if (meeting.startedAt && meeting.endedAt) {
        durationMinutes = Math.round(
          (meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60000,
        );
      }

      return {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        hostName,
        isHost: meeting.hostId === userId,
        participantCount: count ?? 0,
        attentionScore: myAttentionScore,
        startedAt: meeting.startedAt?.toISOString() ?? null,
        endedAt: meeting.endedAt?.toISOString() ?? null,
        durationMinutes,
        createdAt: meeting.createdAt.toISOString(),
      };
    }),
  );

  res.json(result);
});

export default router;
