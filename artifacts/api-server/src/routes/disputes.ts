import { Router } from "express";
import { db } from "@workspace/db";
import { disputesTable, escrowsTable, activityTable } from "@workspace/db";
import { eq, desc, and, count } from "drizzle-orm";
import {
  CreateDisputeBody,
  ListDisputesQueryParams,
  GetDisputeParams,
  ResolveDisputeParams,
  ResolveDisputeBody,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

router.get("/disputes/summary", async (req, res) => {
  try {
    const rows = await db
      .select({ state: disputesTable.state, cnt: count() })
      .from(disputesTable)
      .groupBy(disputesTable.state);

    const byState: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byState[r.state] = Number(r.cnt);
      total += Number(r.cnt);
    }

    const resolved = await db
      .select()
      .from(disputesTable)
      .where(eq(disputesTable.state, "resolved"));

    let avgResolutionDays = 0;
    const resolvedWithDuration = resolved.filter((d) => d.resolvedAt);
    if (resolvedWithDuration.length > 0) {
      const totalMs = resolvedWithDuration.reduce((sum, d) => {
        return sum + (d.resolvedAt!.getTime() - d.createdAt.getTime());
      }, 0);
      avgResolutionDays = totalMs / resolvedWithDuration.length / 86400000;
    }

    const escalated = byState["escalated"] ?? 0;
    const klerosEscalationRate = total > 0 ? escalated / total : 0;

    res.json({
      total,
      byState,
      avgResolutionDays,
      klerosEscalationRate,
      totalBondsLocked: "0",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/disputes", async (req, res) => {
  try {
    const query = ListDisputesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { state, limit, offset } = query.data;

    const conditions = [];
    if (state) conditions.push(eq(disputesTable.state, state));

    const [items, [{ cnt }]] = await Promise.all([
      db
        .select()
        .from(disputesTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(disputesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ cnt: count() })
        .from(disputesTable)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    res.json({ items, total: Number(cnt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/disputes", async (req, res) => {
  try {
    const body = CreateDisputeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [escrow] = await db
      .select()
      .from(escrowsTable)
      .where(eq(escrowsTable.id, body.data.escrowId));

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    const id = randomUUID();
    const [dispute] = await db
      .insert(disputesTable)
      .values({ id, ...body.data })
      .returning();

    await db
      .update(escrowsTable)
      .set({ state: "disputed" })
      .where(eq(escrowsTable.id, body.data.escrowId));

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "dispute_opened",
      escrowId: body.data.escrowId,
      actorAddress: body.data.disputerAddress,
      data: { reason: body.data.reason, bondAmount: body.data.bondAmount },
    });

    res.status(201).json(dispute);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/disputes/:id", async (req, res) => {
  try {
    const params = GetDisputeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const [dispute] = await db
      .select()
      .from(disputesTable)
      .where(eq(disputesTable.id, params.data.id));

    if (!dispute) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }

    res.json(dispute);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/disputes/:id/resolve", async (req, res) => {
  try {
    const params = ResolveDisputeParams.safeParse(req.params);
    const body = ResolveDisputeBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [dispute] = await db
      .update(disputesTable)
      .set({
        state: "resolved",
        resolvedOutcomeIndex: body.data.resolvedOutcomeIndex,
        resolvedBy: body.data.resolvedBy,
        aiVerdictSummary: body.data.aiVerdictSummary,
        klerosDisputeId: body.data.klerosDisputeId,
        resolvedAt: new Date(),
      })
      .where(eq(disputesTable.id, params.data.id))
      .returning();

    if (!dispute) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "dispute_resolved",
      escrowId: dispute.escrowId,
      actorAddress: body.data.resolvedBy,
      data: {
        outcomeIndex: body.data.resolvedOutcomeIndex,
        resolvedBy: body.data.resolvedBy,
      },
    });

    res.json(dispute);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
