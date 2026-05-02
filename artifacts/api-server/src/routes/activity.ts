import { Router } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListActivityQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/activity", async (req, res) => {
  try {
    const query = ListActivityQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { escrow_id, limit } = query.data;

    let q = db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.timestamp))
      .limit(limit);

    if (escrow_id) {
      q = q.where(eq(activityTable.escrowId, escrow_id)) as typeof q;
    }

    const items = await q;
    res.json({ items });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
