import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, escrowsTable, activityTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  AddParticipantBody,
  AddParticipantParams,
  ListParticipantsParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router({ mergeParams: true });

router.get("/escrows/:id/participants", async (req, res) => {
  try {
    const params = ListParticipantsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const items = await db
      .select()
      .from(participantsTable)
      .where(eq(participantsTable.escrowId, params.data.id));

    res.json({ items });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/escrows/:id/participants", requireAuth, async (req, res) => {
  try {
    const params = AddParticipantParams.safeParse(req.params);
    const body = AddParticipantBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const id = randomUUID();
    const [participant] = await db
      .insert(participantsTable)
      .values({ id, escrowId: params.data.id, ...body.data })
      .returning();

    await db
      .update(escrowsTable)
      .set({ participantCount: sql`${escrowsTable.participantCount} + 1` })
      .where(eq(escrowsTable.id, params.data.id));

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "participant_added",
      escrowId: params.data.id,
      actorAddress: body.data.address,
      data: { role: body.data.role },
    });

    res.status(201).json(participant);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
