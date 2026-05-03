import { Router } from "express";
import { SUPPORTED_CHAINS, getChainInfo } from "../lib/chain.js";
import { runIndexer, getIndexerStatus } from "../lib/indexer.js";

const router = Router();

router.get("/chains", async (_req, res) => {
  res.json({
    chains: Object.keys(SUPPORTED_CHAINS),
    count: Object.keys(SUPPORTED_CHAINS).length,
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

router.post("/admin/sync", async (req, res) => {
  try {
    const result = await runIndexer();
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Indexer run failed" });
  }
});

export default router;
