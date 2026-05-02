import { pgTable, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { meetingsTable } from "./meetings";

export const attentionRecordsTable = pgTable("attention_records", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  score: real("score").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttentionRecordSchema = createInsertSchema(attentionRecordsTable).omit({ id: true, recordedAt: true });
export type InsertAttentionRecord = z.infer<typeof insertAttentionRecordSchema>;
export type AttentionRecord = typeof attentionRecordsTable.$inferSelect;
