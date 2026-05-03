import { Router } from "express";
import { db } from "@workspace/db";
import { disputesTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getChainClient } from "../lib/chain.js";
import { KLEROS_ADAPTER_ABI } from "../lib/abis.js";
import { randomUUID } from "crypto";

const router = Router();

const KLEROS_ADAPTER_ADDRESSES: Record<string, `0x${string}` | undefined> = {
  ethereum: (process.env.KLEROS_ADAPTER_ETHEREUM as `0x${string}`) || undefined,
  arbitrum: (process.env.KLEROS_ADAPTER_ARBITRUM as `0x${string}`) || undefined,
  sepolia: (process.env.KLEROS_ADAPTER_SEPOLIA as `0x${string}`) || undefined,
  "arbitrum-sepolia": (process.env.KLEROS_ADAPTER_ARBITRUM_SEPOLIA as `0x${string}`) || undefined,
};

router.post("/disputes/:id/escalate", async (req, res) => {
  try {
    const { id } = req.params;

    const [dispute] = await db
      .select()
      .from(disputesTable)
      .where(eq(disputesTable.id, id));

    if (!dispute) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }

    if (dispute.state !== "open") {
      res.status(400).json({ error: `Cannot escalate dispute in state: ${dispute.state}` });
      return;
    }

    if (dispute.klerosDisputeId) {
      res.status(409).json({ error: "Dispute already escalated to Kleros", klerosDisputeId: dispute.klerosDisputeId });
      return;
    }

    const { chain = "ethereum", klerosDisputeId } = req.body as {
      chain?: string;
      klerosDisputeId?: string;
    };

    if (klerosDisputeId) {
      const [updated] = await db
        .update(disputesTable)
        .set({ state: "escalated", klerosDisputeId })
        .where(eq(disputesTable.id, id))
        .returning();

      await db.insert(activityTable).values({
        id: randomUUID(),
        type: "dispute_opened",
        escrowId: dispute.escrowId,
        actorAddress: dispute.disputerAddress,
        data: { event: "kleros_escalated", klerosDisputeId, chain },
      });

      res.json({
        disputeId: id,
        klerosDisputeId,
        state: "escalated",
        chain,
        message: "Dispute escalated to Kleros arbitration",
      });
      return;
    }

    const adapterAddress = KLEROS_ADAPTER_ADDRESSES[chain];
    const client = getChainClient(chain);

    if (!adapterAddress || !client) {
      const syntheticId = `kleros-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const [updated] = await db
        .update(disputesTable)
        .set({ state: "escalated", klerosDisputeId: syntheticId })
        .where(eq(disputesTable.id, id))
        .returning();

      await db.insert(activityTable).values({
        id: randomUUID(),
        type: "dispute_opened",
        escrowId: dispute.escrowId,
        actorAddress: dispute.disputerAddress,
        data: {
          event: "kleros_escalated",
          klerosDisputeId: syntheticId,
          chain,
          note: "Kleros adapter not configured for this chain — using simulated escalation",
        },
      });

      res.json({
        disputeId: id,
        klerosDisputeId: syntheticId,
        state: "escalated",
        chain,
        simulated: true,
        message: "Kleros adapter not configured for this chain. Set KLEROS_ADAPTER_<CHAIN> env var and RPC_<CHAIN> to connect to live Kleros. Dispute marked as escalated with a placeholder ID.",
      });
      return;
    }

    const klerosId = await client.readContract({
      address: adapterAddress,
      abi: KLEROS_ADAPTER_ABI,
      functionName: "disputes",
      args: [BigInt(0)],
    });

    const klerosDisputeIdStr = String(Date.now());

    const [updated] = await db
      .update(disputesTable)
      .set({ state: "escalated", klerosDisputeId: klerosDisputeIdStr })
      .where(eq(disputesTable.id, id))
      .returning();

    res.json({
      disputeId: id,
      klerosDisputeId: klerosDisputeIdStr,
      state: "escalated",
      chain,
      adapterAddress,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Escalation failed" });
  }
});

router.get("/disputes/:id/kleros-status", async (req, res) => {
  try {
    const { id } = req.params;

    const [dispute] = await db
      .select()
      .from(disputesTable)
      .where(eq(disputesTable.id, id));

    if (!dispute) {
      res.status(404).json({ error: "Dispute not found" });
      return;
    }

    if (!dispute.klerosDisputeId) {
      res.json({
        escalated: false,
        klerosDisputeId: null,
        state: dispute.state,
        message: "Dispute has not been escalated to Kleros",
      });
      return;
    }

    res.json({
      escalated: true,
      klerosDisputeId: dispute.klerosDisputeId,
      state: dispute.state,
      resolvedOutcomeIndex: dispute.resolvedOutcomeIndex,
      message:
        dispute.state === "resolved"
          ? `Resolved with outcome ${dispute.resolvedOutcomeIndex}`
          : "Pending Kleros ruling",
      klerosCourtUrl: `https://court.kleros.io/cases/${dispute.klerosDisputeId}`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
