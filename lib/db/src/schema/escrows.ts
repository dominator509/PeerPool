import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const escrowStateEnum = ["pending", "funded", "active", "disputed", "settled", "closed"] as const;

export const escrowsTable = pgTable("escrows", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  state: text("state").notNull().default("pending").$type<typeof escrowStateEnum[number]>(),
  chain: text("chain").notNull(),
  contractAddress: text("contract_address"),
  token: text("token").notNull(),
  totalAmount: text("total_amount").notNull(),
  fundedAmount: text("funded_amount").notNull().default("0"),
  creatorAddress: text("creator_address").notNull(),
  manifestId: text("manifest_id").notNull(),
  deadline: timestamp("deadline"),
  participantCount: integer("participant_count").notNull().default(0),
  voteCount: integer("vote_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  fundedAt: timestamp("funded_at"),
}, (table) => [
  index("escrows_state_idx").on(table.state),
  index("escrows_chain_idx").on(table.chain),
  index("escrows_creator_idx").on(table.creatorAddress),
  index("escrows_manifest_idx").on(table.manifestId),
]);

export const insertEscrowSchema = createInsertSchema(escrowsTable).omit({
  state: true,
  fundedAmount: true,
  participantCount: true,
  voteCount: true,
  createdAt: true,
  fundedAt: true,
  contractAddress: true,
});

export type InsertEscrow = z.infer<typeof insertEscrowSchema>;
export type Escrow = typeof escrowsTable.$inferSelect;
