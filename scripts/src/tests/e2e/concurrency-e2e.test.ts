import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildSettlementTree,
  verifyProof,
} from "../../../../artifacts/api-server/src/lib/merkle.js";
import {
  consumeNonce,
  generateNonce,
} from "../../../../artifacts/api-server/src/lib/auth.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");

function assertOk(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assertOk(address && typeof address === "object", "failed to allocate test port");
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl: string, child: ChildProcess): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      const res = await fetch(`${baseUrl}/api/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out waiting for server");
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      PEERPOOL_WEB_DIST: webDist,
      DATABASE_URL: "postgres://peerpool:peerpool@127.0.0.1:1/peerpool",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(baseUrl, child);
    await run(baseUrl);
  } finally {
    child.kill();
  }
}

async function readJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  assert.match(contentType, /application\/json/i);
  return await response.json();
}

test("e2e auth lifecycle: nonce -> verify -> session -> logout -> session invalid", async () => {
  await withServer(async (baseUrl) => {
    const account = privateKeyToAccount(
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    );

    const nonceRes = await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`);
    assert.equal(nonceRes.status, 200);
    const nonceBody = await readJson(nonceRes);
    const signature = await account.signMessage({ message: nonceBody.message });

    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: account.address,
        signature,
        nonce: nonceBody.nonce,
      }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await readJson(verifyRes);
    assert.match(verifyBody.token, /^[0-9a-f]{64}$/);

    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${verifyBody.token}` },
    });
    assert.equal(sessionRes.status, 200);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifyBody.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const invalidSessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${verifyBody.token}` },
    });
    assert.equal(invalidSessionRes.status, 401);
  });
});

test("high-throughput concurrent session validation remains consistent", async () => {
  await withServer(async (baseUrl) => {
    const account = privateKeyToAccount(
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    );

    const nonceBody = await readJson(
      await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`),
    );
    const signature = await account.signMessage({ message: nonceBody.message });
    const verifyBody = await readJson(
      await fetch(`${baseUrl}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: account.address,
          signature,
          nonce: nonceBody.nonce,
        }),
      }),
    );

    const checks = await Promise.all(
      Array.from({ length: 40 }, () =>
        fetch(`${baseUrl}/api/auth/session`, {
          headers: { Authorization: `Bearer ${verifyBody.token}` },
        }),
      ),
    );

    const statuses = checks.map((r) => r.status);
    assert.equal(statuses.some((s) => s === 200), true);
    assert.equal(statuses.every((s) => s === 200 || s === 429), true);
    assert.equal(statuses.some((s) => s === 401 || s >= 500), false);
  });
});

test("nonce consumption under contention permits exactly one successful consume", async () => {
  const address = "0x3333333333333333333333333333333333333333";
  generateNonce(address);

  const outcomes = await Promise.all(
    Array.from({ length: 20 }, () => Promise.resolve(consumeNonce(address))),
  );
  const successes = outcomes.filter(Boolean);
  assert.equal(successes.length, 1);
});

test("concurrent merkle proof verification remains deterministic at scale", async () => {
  const claims = Array.from({ length: 120 }, (_, i) => ({
    claimantAddress: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    amount: String((i + 1) * 10),
    escrowId: "escrow-concurrency",
  }));
  const tree = buildSettlementTree(claims);

  const validations = await Promise.all(
    tree.leaves.map((leaf) =>
      Promise.resolve(
        verifyProof(
          tree.root,
          leaf.claimantAddress,
          leaf.amount,
          "escrow-concurrency",
          leaf.proof,
        ),
      ),
    ),
  );

  assert.equal(validations.every(Boolean), true);
});
