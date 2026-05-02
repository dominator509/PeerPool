import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const participantRoleEnum = ["depositor", "beneficiary", "arbitrator", "observer"] as const;

export const participantsTable = pgTable("participants", {
  id: text("id").primaryKey(),
  escrowId: text("escrow_id").notNull(),
  address: text("address").notNull(),
  role: text("role").notNull().$type<typeof participantRoleEnum[number]>(),
  fundedAmount: text("funded_amount").notNull().default("0"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({
  fundedAmount: true,
  joinedAt: true,
});

export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;
