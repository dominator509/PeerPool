import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const apiEntry = path.join(root, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(root, "artifacts", "peerpool-web", "dist", "public");

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function port(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      must(a && typeof a === "object", "port fail");
      s.close(() => resolve(a.port));
    });
  });
}

async function ready(baseUrl: string, child: ChildProcess): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if (child.exitCode !== null) throw new Error(`exit ${child.exitCode}`);
    try {
      const res = await fetch(`${baseUrl}/api/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("ready timeout");
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const p = await port();
  const baseUrl = `http://127.0.0.1:${p}`;
  const child = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(p),
      PEERPOOL_WEB_DIST: webDist,
      DATABASE_URL: "postgres://peerpool:peerpool@127.0.0.1:1/peerpool",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await ready(baseUrl, child);
    await run(baseUrl);
  } finally {
    child.kill();
  }
}

async function token(baseUrl: string): Promise<string> {
  const account = privateKeyToAccount(
    "0x1212121212121212121212121212121212121212121212121212121212121212",
  );
  const nonce = await (await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`)).json();
  const signature = await account.signMessage({ message: nonce.message });
  const verify = await (
    await fetch(`${baseUrl}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature, nonce: nonce.nonce }),
    })
  ).json();
  return verify.token;
}

function assertNoStackLeak(bodyText: string): void {
  assert.equal(/TypeError|ReferenceError|SyntaxError|at\s+[A-Za-z0-9_.]+/.test(bodyText), false);
}

test("exception boundaries return sanitized JSON (no stack leak) on degraded DB paths", async () => {
  await withServer(async (baseUrl) => {
    const auth = `Bearer ${await token(baseUrl)}`;

    const calls: Array<{ url: string; method: string; body?: unknown }> = [
      { url: `${baseUrl}/api/disputes/not-real/resolve`, method: "POST", body: { resolvedOutcomeIndex: 0, resolvedBy: "0x1111111111111111111111111111111111111111" } },
      { url: `${baseUrl}/api/disputes/not-real/escalate`, method: "POST", body: { chain: "ethereum" } },
      { url: `${baseUrl}/api/escrows/not-real/claims/not-real/submit`, method: "POST", body: { merkleProof: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] } },
      { url: `${baseUrl}/api/escrows/not-real/settlement`, method: "POST", body: {} },
      { url: `${baseUrl}/api/admin/sync`, method: "POST", body: {} },
    ];

    for (const c of calls) {
      const res = await fetch(c.url, {
        method: c.method,
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(c.body ?? {}),
      });
      const txt = await res.text();
      assert.match(res.headers.get("content-type") ?? "", /application\/json/i);
      assertNoStackLeak(txt);
      assert.equal([401, 403, 404, 409, 413, 500, 503].includes(res.status), true);
    }
  });
});

test("taint-path endpoint rejects malformed untrusted body before sink execution path", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/escrows/x/settlement/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimantAddress: "not-an-address",
        amount: "NaN",
        merkleRoot: "0x123",
        proof: ["badproof"],
      }),
    });
    assert.equal(res.status, 400);
    const txt = await res.text();
    assertNoStackLeak(txt);
  });
});
