import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const votesTable = pgTable("votes", {
  id: text("id").primaryKey(),
  escrowId: text("escrow_id").notNull(),
  voterAddress: text("voter_address").notNull(),
  outcomeIndex: integer("outcome_index").notNull(),
  outcomeLabel: text("outcome_label"),
  weight: text("weight").notNull().default("1"),
  signature: text("signature"),
  votedAt: timestamp("voted_at").notNull().defaultNow(),
});

export const insertVoteSchema = createInsertSchema(votesTable).omit({
  weight: true,
  votedAt: true,
});

export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votesTable.$inferSelect;
