import { Router } from "express";
import { SUPPORTED_CHAINS, getChainInfo } from "../lib/chain.js";
import { PROTOCOL_CHAINS } from "@workspace/protocol-config";
import { runIndexer, getIndexerStatus } from "../lib/indexer.js";
import { requireAuth } from "../lib/auth.js";
import { isDependencyFailure } from "../lib/errors.js";

const router = Router();

router.get("/chains", async (_req, res) => {
  res.json({
    chains: Object.keys(SUPPORTED_CHAINS),
    count: Object.keys(SUPPORTED_CHAINS).length,
    items: PROTOCOL_CHAINS,
  });
});

router.get("/chains/:name", async (req, res) => {
  try {
    const info = await getChainInfo(req.params.name);
    if (!info) {
      res.status(404).json({ error: "Chain not supported" });
      return;
    }
    res.json(info);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to query chain" });
  }
});

router.get("/admin/indexer", async (_req, res) => {
  res.json(getIndexerStatus());
});

router.post("/admin/sync", requireAuth, async (req, res) => {
  try {
    const preStatus = getIndexerStatus();
    if (preStatus.running) {
      res.status(409).json({ ok: false, error: "Indexer already running" });
      return;
    }

    const result = await runIndexer();
    const status = getIndexerStatus();
    if (status.lastError) {
      res.status(503).json({
        ok: false,
        error: "Indexer sync failed",
        syncedContracts: result.syncedContracts,
        eventsProcessed: result.eventsProcessed,
      });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error(err);
    if (isDependencyFailure(err)) {
      res.status(503).json({ ok: false, error: "Indexer dependency unavailable" });
      return;
    }
    res.status(500).json({ error: "Indexer run failed" });
  }
});

export default router;
