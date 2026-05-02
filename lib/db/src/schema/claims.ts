import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claimStateEnum = ["pending", "submitted", "executed", "rejected"] as const;

export const claimsTable = pgTable("claims", {
  id: text("id").primaryKey(),
  escrowId: text("escrow_id").notNull(),
  claimantAddress: text("claimant_address").notNull(),
  amount: text("amount").notNull(),
  merkleRoot: text("merkle_root"),
  merkleProof: jsonb("merkle_proof").$type<string[]>(),
  leafHash: text("leaf_hash"),
  state: text("state").notNull().default("pending").$type<typeof claimStateEnum[number]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  executedAt: timestamp("executed_at"),
});

export const insertClaimSchema = createInsertSchema(claimsTable).omit({
  state: true,
  merkleProof: true,
  createdAt: true,
  submittedAt: true,
  executedAt: true,
});

export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claimsTable.$inferSelect;
