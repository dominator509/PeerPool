import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityTypeEnum = [
  "escrow_created",
  "escrow_funded",
  "participant_added",
  "vote_submitted",
  "dispute_opened",
  "dispute_resolved",
  "claim_created",
  "claim_executed",
  "manifest_registered",
] as const;

export const activityTable = pgTable("activity", {
  id: text("id").primaryKey(),
  type: text("type").notNull().$type<typeof activityTypeEnum[number]>(),
  escrowId: text("escrow_id").notNull(),
  actorAddress: text("actor_address").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("activity_escrow_id_idx").on(table.escrowId),
  index("activity_type_idx").on(table.type),
  index("activity_timestamp_idx").on(table.timestamp),
]);

export const insertActivitySchema = createInsertSchema(activityTable).omit({
  timestamp: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
