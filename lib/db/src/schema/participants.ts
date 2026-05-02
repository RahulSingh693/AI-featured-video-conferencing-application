import { pgTable, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { meetingsTable } from "./meetings";

export const participantsTable = pgTable("participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  joinTime: timestamp("join_time", { withTimezone: true }).defaultNow(),
  leaveTime: timestamp("leave_time", { withTimezone: true }),
  attentionScore: real("attention_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({ id: true, createdAt: true });
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;
