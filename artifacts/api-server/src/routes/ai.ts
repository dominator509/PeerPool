import { Router } from "express";
import { db } from "@workspace/db";
import { disputesTable, escrowsTable, manifestsTable, claimsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

router.post("/disputes/:id/ai-review", async (req, res) => {
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

    const [escrow] = await db
      .select()
      .from(escrowsTable)
      .where(eq(escrowsTable.id, dispute.escrowId));

    const [manifest] = escrow?.manifestId
      ? await db.select().from(manifestsTable).where(eq(manifestsTable.id, escrow.manifestId))
      : [null];

    const claims = await db
      .select()
      .from(claimsTable)
      .where(eq(claimsTable.escrowId, dispute.escrowId));

    const systemPrompt = `You are a non-custodial, advisory-only AI dispute reviewer for PeerPool, a decentralized multi-party escrow protocol. Your role is to analyze disputes impartially and provide a concise, structured verdict summary. You are NOT a final arbitrator — your analysis is advisory and supplementary to the on-chain voting and Kleros arbitration processes. Always be balanced, precise, and base your analysis solely on the provided data. Never assert bias toward any party.`;

    const userPrompt = `Review this escrow dispute and provide a structured verdict summary.

ESCROW
- Title: ${escrow?.title ?? "Unknown"}
- Chain: ${escrow?.chain ?? "Unknown"}
- Total Amount: ${escrow?.totalAmount ?? "Unknown"}
- State: ${escrow?.state ?? "Unknown"}
- Participants: ${escrow?.participantCount ?? 0}

MANIFEST OUTCOMES
${manifest?.outcomes ? JSON.stringify(manifest.outcomes, null, 2) : "No manifest available"}

MANIFEST CONDITIONS
${manifest?.conditions ? JSON.stringify(manifest.conditions, null, 2) : "No conditions available"}

DISPUTE
- Reason: ${dispute.reason}
- Bond Amount: ${dispute.bondAmount} (wei)
- Opened: ${dispute.createdAt.toISOString()}

CLAIMS (${claims.length} total)
${claims.map((c) => `- ${c.claimantAddress}: ${c.amount} (${c.state})`).join("\n") || "None"}

Provide a structured response with:
1. ASSESSMENT: Brief impartial analysis of the dispute (2-3 sentences)
2. RECOMMENDED OUTCOME: Which outcome index (from the manifest) best fits the evidence, with confidence (0.00-1.00)
3. RATIONALE: Key reasons for the recommendation (2-3 bullet points)
4. CAVEATS: Any important limitations or missing evidence (1-2 sentences)

Format as plain text, no markdown.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        { role: "user", content: userPrompt },
      ],
      system: systemPrompt,
    });

    const block = message.content[0];
    const verdictText = block.type === "text" ? block.text : "";

    const [updated] = await db
      .update(disputesTable)
      .set({ aiVerdictSummary: verdictText })
      .where(eq(disputesTable.id, id))
      .returning();

    res.json({
      id: updated.id,
      aiVerdictSummary: verdictText,
      model: "claude-sonnet-4-6",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI review failed" });
  }
});

export default router;
