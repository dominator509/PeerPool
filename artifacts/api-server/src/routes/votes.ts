import { Router } from "express";
import { db } from "@workspace/db";
import { votesTable, escrowsTable, activityTable, manifestsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListVotesParams,
  SubmitVoteParams,
  SubmitVoteBody,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router = Router();

router.get("/escrows/:id/votes", async (req, res) => {
  try {
    const params = ListVotesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const items = await db
      .select()
      .from(votesTable)
      .where(eq(votesTable.escrowId, params.data.id));

    const tallyMap = new Map<number, { outcomeLabel: string; voteCount: number; totalWeight: bigint }>();
    for (const v of items) {
      const existing = tallyMap.get(v.outcomeIndex);
      if (existing) {
        existing.voteCount += 1;
        existing.totalWeight += BigInt(v.weight ?? "1");
      } else {
        tallyMap.set(v.outcomeIndex, {
          outcomeLabel: v.outcomeLabel ?? `Outcome ${v.outcomeIndex}`,
          voteCount: 1,
          totalWeight: BigInt(v.weight ?? "1"),
        });
      }
    }

    const tally = Array.from(tallyMap.entries()).map(([outcomeIndex, t]) => ({
      outcomeIndex,
      outcomeLabel: t.outcomeLabel,
      voteCount: t.voteCount,
      totalWeight: t.totalWeight.toString(),
    }));

    res.json({ items, tally });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows/:id/votes", async (req, res) => {
  try {
    const params = SubmitVoteParams.safeParse(req.params);
    const body = SubmitVoteBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
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

    let outcomeLabel: string | undefined;
    const [manifest] = await db
      .select()
      .from(manifestsTable)
      .where(eq(manifestsTable.id, escrow.manifestId));

    if (manifest) {
      const outcomes = manifest.outcomes as Array<{ index: number; label: string }>;
      const outcome = outcomes.find((o) => o.index === body.data.outcomeIndex);
      outcomeLabel = outcome?.label;
    }

    const id = randomUUID();
    const [vote] = await db
      .insert(votesTable)
      .values({
        id,
        escrowId: params.data.id,
        voterAddress: body.data.voterAddress,
        outcomeIndex: body.data.outcomeIndex,
        outcomeLabel,
        weight: body.data.weight ?? "1",
        signature: body.data.signature,
      })
      .returning();

    await db
      .update(escrowsTable)
      .set({ voteCount: sql`${escrowsTable.voteCount} + 1` })
      .where(eq(escrowsTable.id, params.data.id));

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "vote_submitted",
      escrowId: params.data.id,
      actorAddress: body.data.voterAddress,
      data: { outcomeIndex: body.data.outcomeIndex, outcomeLabel },
    });

    res.status(201).json(vote);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
