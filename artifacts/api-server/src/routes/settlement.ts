import { Router } from "express";
import { db } from "@workspace/db";
import { claimsTable, escrowsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildSettlementTree, verifyProof } from "../lib/merkle.js";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth.js";
import { isDependencyFailure } from "../lib/errors.js";

const router = Router();
const MAX_PROOF_ITEMS = 256;
const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const UINT_REGEX = /^(0|[1-9][0-9]{0,77})$/;

router.post("/escrows/:id/settlement", requireAuth, async (req, res) => {
  try {
    const id = String(req.params["id"]);

    const [escrow] = await db
      .select()
      .from(escrowsTable)
      .where(eq(escrowsTable.id, id));

    if (!escrow) {
      res.status(404).json({ error: "Escrow not found" });
      return;
    }

    const claims = await db
      .select()
      .from(claimsTable)
      .where(eq(claimsTable.escrowId, id));

    if (!claims.length) {
      res.status(400).json({ error: "No claims to settle" });
      return;
    }

    const leafInputs = claims.map((c) => ({
      claimantAddress: c.claimantAddress,
      amount: c.amount,
      escrowId: id,
    }));

    const { root, leaves } = buildSettlementTree(leafInputs);

    await db.transaction(async (tx) => {
      for (let i = 0; i < claims.length; i++) {
        await tx
          .update(claimsTable)
          .set({
            merkleRoot: root,
            merkleProof: leaves[i].proof,
            leafHash: leaves[i].leaf,
          })
          .where(eq(claimsTable.id, claims[i].id));
      }

      await tx
        .update(escrowsTable)
        .set({ state: "settled" })
        .where(eq(escrowsTable.id, id));

      await tx.insert(activityTable).values({
        id: randomUUID(),
        type: "escrow_settled",
        escrowId: id,
        actorAddress: "system",
        data: { merkleRoot: root, claimCount: claims.length, event: "settlement_root_posted" },
      });
    });

    res.json({
      escrowId: id,
      merkleRoot: root,
      claimCount: claims.length,
      leaves: leaves.map((l) => ({
        claimantAddress: l.claimantAddress,
        amount: l.amount,
        leafHash: l.leaf,
        proof: l.proof,
      })),
    });
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Settlement dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Settlement computation failed" });
  }
});

router.get("/escrows/:id/settlement", async (req, res) => {
  try {
    const id = String(req.params["id"]);

    const claims = await db
      .select()
      .from(claimsTable)
      .where(eq(claimsTable.escrowId, id));

    const withProofs = claims.filter((c) => c.merkleRoot);
    if (!withProofs.length) {
      res.status(404).json({ error: "No settlement root found for this escrow" });
      return;
    }

    const root = withProofs[0].merkleRoot!;

    res.json({
      escrowId: id,
      merkleRoot: root,
      claimCount: withProofs.length,
      leaves: withProofs.map((c) => ({
        claimantAddress: c.claimantAddress,
        amount: c.amount,
        leafHash: c.leafHash,
        proof: c.merkleProof ?? [],
        state: c.state,
      })),
    });
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Settlement dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows/:id/settlement/verify", async (req, res) => {
  try {
    const id = String(req.params["id"]);
    const { claimantAddress, amount, proof, merkleRoot } = req.body as {
      claimantAddress: string;
      amount: string;
      proof: string[];
      merkleRoot: string;
    };

    if (!claimantAddress || !amount || !proof || !merkleRoot) {
      res.status(400).json({ error: "Missing required fields: claimantAddress, amount, proof, merkleRoot" });
      return;
    }
    if (!ADDRESS_REGEX.test(claimantAddress)) {
      res.status(400).json({ error: "Invalid claimantAddress format" });
      return;
    }
    if (!UINT_REGEX.test(amount)) {
      res.status(400).json({ error: "Invalid amount format" });
      return;
    }
    if (!HEX_32_REGEX.test(merkleRoot)) {
      res.status(400).json({ error: "Invalid merkleRoot format" });
      return;
    }
    if (!Array.isArray(proof)) {
      res.status(400).json({ error: "Proof must be an array" });
      return;
    }
    if (proof.length > MAX_PROOF_ITEMS) {
      res.status(413).json({ error: `Proof too large: max ${MAX_PROOF_ITEMS} items` });
      return;
    }
    if (!proof.every((item) => typeof item === "string" && HEX_32_REGEX.test(item))) {
      res.status(400).json({ error: "Invalid proof item format" });
      return;
    }

    const valid = verifyProof(merkleRoot, claimantAddress, amount, id, proof);

    res.json({ valid, claimantAddress, amount, escrowId: id });
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ error: "Settlement dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
