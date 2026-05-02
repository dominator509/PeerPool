import { Router } from "express";
import { db } from "@workspace/db";
import { escrowsTable, activityTable } from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import {
  CreateEscrowBody,
  ListEscrowsQueryParams,
  UpdateEscrowBody,
  GetEscrowParams,
  UpdateEscrowParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

router.get("/escrows/summary", async (req, res) => {
  try {
    const rows = await db
      .select({ state: escrowsTable.state, cnt: count() })
      .from(escrowsTable)
      .groupBy(escrowsTable.state);

    const byState: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byState[r.state] = Number(r.cnt);
      total += Number(r.cnt);
    }

    const recent = await db
      .select({ id: escrowsTable.id })
      .from(escrowsTable)
      .where(sql`${escrowsTable.createdAt} >= now() - interval '7 days'`);

    const avgResult = await db
      .select({ avg: sql<string>`avg(${escrowsTable.participantCount})` })
      .from(escrowsTable);

    res.json({
      total,
      byState,
      totalValueLocked: "0",
      recentCount: recent.length,
      avgParticipants: parseFloat(avgResult[0]?.avg ?? "0"),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/escrows", async (req, res) => {
  try {
    const query = ListEscrowsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { state, chain, limit, offset } = query.data;

    const conditions = [];
    if (state) conditions.push(eq(escrowsTable.state, state));
    if (chain) conditions.push(eq(escrowsTable.chain, chain));

    const [items, [{ cnt }]] = await Promise.all([
      db
        .select()
        .from(escrowsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(escrowsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ cnt: count() })
        .from(escrowsTable)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    res.json({ items, total: Number(cnt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows", async (req, res) => {
  try {
    const body = CreateEscrowBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const id = randomUUID();
    const [escrow] = await db
      .insert(escrowsTable)
      .values({ id, ...body.data })
      .returning();

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "escrow_created",
      escrowId: id,
      actorAddress: body.data.creatorAddress,
      data: { title: body.data.title },
    });

    res.status(201).json(escrow);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/escrows/:id", async (req, res) => {
  try {
    const params = GetEscrowParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const [escrow] = await db
      .select()
      .from(escrowsTable)
      .where(eq(escrowsTable.id, params.data.id));

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    res.json(escrow);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/escrows/:id", async (req, res) => {
  try {
    const params = UpdateEscrowParams.safeParse(req.params);
    const body = UpdateEscrowBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (body.data.state !== undefined) updates.state = body.data.state;
    if (body.data.contractAddress !== undefined) updates.contractAddress = body.data.contractAddress;
    if (body.data.fundedAmount !== undefined) updates.fundedAmount = body.data.fundedAmount;
    if (body.data.fundedAt !== undefined) updates.fundedAt = body.data.fundedAt;

    const [escrow] = await db
      .update(escrowsTable)
      .set(updates)
      .where(eq(escrowsTable.id, params.data.id))
      .returning();

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    if (body.data.state === "funded") {
      await db.insert(activityTable).values({
        id: randomUUID(),
        type: "escrow_funded",
        escrowId: params.data.id,
        actorAddress: escrow.creatorAddress,
        data: { fundedAmount: body.data.fundedAmount },
      });
    }

    res.json(escrow);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
