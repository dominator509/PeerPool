import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const disputeStateEnum = ["open", "escalated", "resolved", "closed"] as const;

export const disputesTable = pgTable("disputes", {
  id: text("id").primaryKey(),
  escrowId: text("escrow_id").notNull(),
  disputerAddress: text("disputer_address").notNull(),
  reason: text("reason").notNull(),
  state: text("state").notNull().default("open").$type<typeof disputeStateEnum[number]>(),
  bondAmount: text("bond_amount").notNull(),
  klerosDisputeId: text("kleros_dispute_id"),
  aiVerdictSummary: text("ai_verdict_summary"),
  resolvedOutcomeIndex: integer("resolved_outcome_index"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("disputes_escrow_id_idx").on(table.escrowId),
  index("disputes_state_idx").on(table.state),
]);

export const insertDisputeSchema = createInsertSchema(disputesTable).omit({
  state: true,
  klerosDisputeId: true,
  aiVerdictSummary: true,
  resolvedOutcomeIndex: true,
  resolvedBy: true,
  createdAt: true,
  resolvedAt: true,
});

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputesTable.$inferSelect;
