import { Router } from "express";
import { db } from "@workspace/db";
import { claimsTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListClaimsParams,
  CreateClaimParams,
  CreateClaimBody,
  SubmitClaimParams,
  SubmitClaimBody,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth.js";
import { isDependencyFailure } from "../lib/errors.js";
import { isUnsignedIntegerString } from "../lib/validation.js";

const router = Router();

router.get("/escrows/:id/claims", async (req, res) => {
  try {
    const params = ListClaimsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const items = await db
      .select()
      .from(claimsTable)
      .where(eq(claimsTable.escrowId, params.data.id));

    res.json({ items });
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Claim dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows/:id/claims", requireAuth, async (req, res) => {
  try {
    const params = CreateClaimParams.safeParse(req.params);
    const body = CreateClaimBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (!isUnsignedIntegerString(body.data.amount)) {
      res.status(400).json({ error: "Invalid amount format" });
      return;
    }

    const id = randomUUID();
    const [claim] = await db
      .insert(claimsTable)
      .values({ id, escrowId: params.data.id, ...body.data })
      .returning();

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "claim_created",
      escrowId: params.data.id,
      actorAddress: body.data.claimantAddress,
      data: { amount: body.data.amount },
    });

    res.status(201).json(claim);
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Claim dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows/:id/claims/:claimId/submit", requireAuth, async (req, res) => {
  try {
    const params = SubmitClaimParams.safeParse(req.params);
    const body = SubmitClaimBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const [claim] = await db
      .update(claimsTable)
      .set({
        state: "submitted",
        merkleProof: body.data.merkleProof,
        submittedAt: new Date(),
      })
      .where(
        and(
          eq(claimsTable.id, params.data.claimId),
          eq(claimsTable.escrowId, params.data.id)
        )
      )
      .returning();

    if (!claim) {
      res.status(404).json({ error: "Claim not found" });
      return;
    }

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "claim_executed",
      escrowId: params.data.id,
      actorAddress: claim.claimantAddress,
      data: { claimId: params.data.claimId, amount: claim.amount },
    });

    res.json(claim);
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Claim dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
