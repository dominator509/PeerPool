import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

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
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
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

async function createAuthToken(baseUrl: string): Promise<string> {
  const account = privateKeyToAccount(
    "0x6666666666666666666666666666666666666666666666666666666666666666",
  );
  const nonceRes = await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`);
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
  const verifyBody = await readJson(verifyRes);
  return verifyBody.token;
}

test("health route returns strict JSON contract", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.deepEqual(body, { status: "ok" });
  });
});

test("db-backed route degrades gracefully to JSON 500 when DB is unreachable", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/escrows?limit=1&offset=0`);
    assert.equal(res.status, 500);
    const body = await readJson(res);
    assert.equal(body.error, "Internal server error");
  });
});

test("schema mismatch on nonce endpoint returns deterministic 400", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/nonce?address=not-an-address`);
    assert.equal(res.status, 400);
    const body = await readJson(res);
    assert.equal(body.error, "Valid EVM address required");
  });
});

test("protected sync endpoint rejects missing token without touching indexer", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/sync`, { method: "POST" });
    assert.equal(res.status, 401);
    const body = await readJson(res);
    assert.equal(body.error, "Authentication required");
  });
});

test("settlement verification endpoint rejects malformed payload", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/escrows/e-1/settlement/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimantAddress: "0x1" }),
    });
    assert.equal(res.status, 400);
    const body = await readJson(res);
    assert.match(body.error, /Missing required fields/i);
  });
});

test("settlement verification rejects oversized proof arrays", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/escrows/e-1/settlement/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimantAddress: "0x1111111111111111111111111111111111111111",
        amount: "1",
        merkleRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        proof: Array.from({ length: 300 }, () => "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      }),
    });
    assert.equal(res.status, 413);
    const body = await readJson(res);
    assert.match(body.error, /Proof too large/i);
  });
});

test("admin sync reports dependency failure instead of ok=true", async () => {
  await withServer(async (baseUrl) => {
    const token = await createAuthToken(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(res.status, 503);
    const body = await readJson(res);
    assert.equal(body.ok, false);
  });
});
