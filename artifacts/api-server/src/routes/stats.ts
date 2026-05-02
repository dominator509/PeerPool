import { Router } from "express";
import { db } from "@workspace/db";
import {
  escrowsTable,
  disputesTable,
  claimsTable,
  manifestsTable,
} from "@workspace/db";
import { count, sql } from "drizzle-orm";

const router = Router();

router.get("/stats", async (req, res) => {
  try {
    const [
      [{ totalEscrows }],
      [{ totalDisputes }],
      [{ totalClaims }],
      [{ totalManifests }],
      chainRows,
    ] = await Promise.all([
      db.select({ totalEscrows: count() }).from(escrowsTable),
      db.select({ totalDisputes: count() }).from(disputesTable),
      db.select({ totalClaims: count() }).from(claimsTable),
      db.select({ totalManifests: count() }).from(manifestsTable),
      db
        .selectDistinct({ chain: escrowsTable.chain })
        .from(escrowsTable),
    ]);

    const activeChains = chainRows.map((r) => r.chain);

    const [resolvedDisputes] = await db
      .select({ cnt: count() })
      .from(disputesTable)
      .where(sql`${disputesTable.state} IN ('resolved', 'closed')`);

    const disputeResolutionRate =
      Number(totalDisputes) > 0
        ? Number(resolvedDisputes?.cnt ?? 0) / Number(totalDisputes)
        : 0;

    res.json({
      totalEscrows: Number(totalEscrows),
      totalValueLocked: "0",
      totalDisputes: Number(totalDisputes),
      totalClaims: Number(totalClaims),
      totalManifests: Number(totalManifests),
      activeChains,
      disputeResolutionRate,
      avgEscrowDurationDays: 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
