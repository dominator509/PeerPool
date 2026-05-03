import { Router } from "express";
import { db } from "@workspace/db";
import { manifestsTable, activityTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  CreateManifestBody,
  ListManifestsQueryParams,
  GetManifestParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/manifests", async (req, res) => {
  try {
    const query = ListManifestsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { limit, offset } = query.data;

    const [items, [{ cnt }]] = await Promise.all([
      db
        .select()
        .from(manifestsTable)
        .orderBy(desc(manifestsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ cnt: count() }).from(manifestsTable),
    ]);

    res.json({ items, total: Number(cnt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/manifests", requireAuth, async (req, res) => {
  try {
    const body = CreateManifestBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const id = randomUUID();
    const [manifest] = await db
      .insert(manifestsTable)
      .values({ id, ...body.data })
      .returning();

    await db.insert(activityTable).values({
      id: randomUUID(),
      type: "manifest_registered",
      escrowId: "system",
      actorAddress: body.data.createdBy,
      data: { manifestId: id, title: body.data.title },
    });

    res.status(201).json(manifest);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/manifests/:id", async (req, res) => {
  try {
    const params = GetManifestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    const [manifest] = await db
      .select()
      .from(manifestsTable)
      .where(eq(manifestsTable.id, params.data.id));

    if (!manifest) {
      res.status(404).json({ error: "Manifest not found" });
      return;
    }

    res.json(manifest);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
