import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manifestsTable = pgTable("manifests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  conditions: jsonb("conditions").notNull().$type<string[]>(),
  outcomes: jsonb("outcomes").notNull().$type<Array<{
    index: number;
    label: string;
    description?: string;
    distributionBps?: number;
  }>>(),
  createdBy: text("created_by").notNull(),
  ipfsHash: text("ipfs_hash"),
  escrowCount: integer("escrow_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertManifestSchema = createInsertSchema(manifestsTable).omit({
  escrowCount: true,
  createdAt: true,
});

export type InsertManifest = z.infer<typeof insertManifestSchema>;
export type Manifest = typeof manifestsTable.$inferSelect;
