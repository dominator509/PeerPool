import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function findPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      must(a && typeof a === "object", "port allocation failed");
      s.close(() => resolve(a.port));
    });
  });
}

async function waitReady(baseUrl: string, child: ChildProcess): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await fetch(`${baseUrl}/api/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timeout");
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const port = await findPort();
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
    await waitReady(baseUrl, child);
    await run(baseUrl);
  } finally {
    child.kill();
  }
}

async function readJson(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /application\/json/i);
  return await res.json();
}

async function authToken(baseUrl: string): Promise<string> {
  const account = privateKeyToAccount(
    "0x7777777777777777777777777777777777777777777777777777777777777777",
  );
  const nonce = await readJson(await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`));
  const signature = await account.signMessage({ message: nonce.message });
  const verify = await readJson(
    await fetch(`${baseUrl}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature, nonce: nonce.nonce }),
    }),
  );
  return verify.token;
}

const validPayload = {
  claimantAddress: "0x1111111111111111111111111111111111111111",
  amount: "1",
  merkleRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  proof: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
};

test("settlement verify branch coverage: all validation guards", async () => {
  await withServer(async (baseUrl) => {
    const mk = (body: unknown) =>
      fetch(`${baseUrl}/api/escrows/e-1/settlement/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const missing = await mk({ claimantAddress: "0x1" });
    assert.equal(missing.status, 400);
    assert.match((await readJson(missing)).error, /Missing required fields/i);

    const badAddr = await mk({ ...validPayload, claimantAddress: "0x123" });
    assert.equal(badAddr.status, 400);
    assert.match((await readJson(badAddr)).error, /Invalid claimantAddress format/);

    const badAmount = await mk({ ...validPayload, amount: "01" });
    assert.equal(badAmount.status, 400);
    assert.match((await readJson(badAmount)).error, /Invalid amount format/);

    const badRoot = await mk({ ...validPayload, merkleRoot: "0xabc" });
    assert.equal(badRoot.status, 400);
    assert.match((await readJson(badRoot)).error, /Invalid merkleRoot format/);

    const nonArrayProof = await mk({ ...validPayload, proof: "x" });
    assert.equal(nonArrayProof.status, 400);
    assert.match((await readJson(nonArrayProof)).error, /Proof must be an array/);

    const hugeProof = await mk({
      ...validPayload,
      proof: Array.from({ length: 300 }, () => validPayload.proof[0]),
    });
    assert.equal(hugeProof.status, 413);
    assert.match((await readJson(hugeProof)).error, /Proof too large/);

    const invalidProofItem = await mk({ ...validPayload, proof: ["nope"] });
    assert.equal(invalidProofItem.status, 400);
    assert.match((await readJson(invalidProofItem)).error, /Invalid proof item format/);

    const validShape = await mk(validPayload);
    assert.equal(validShape.status, 200);
    const body = await readJson(validShape);
    assert.equal(typeof body.valid, "boolean");
    assert.equal(body.escrowId, "e-1");
  });
});

test("admin sync branch coverage: auth, running guard, dependency failure", async () => {
  await withServer(async (baseUrl) => {
    const unauth = await fetch(`${baseUrl}/api/admin/sync`, { method: "POST" });
    assert.equal(unauth.status, 401);

    const token = await authToken(baseUrl);
    const req = () =>
      fetch(`${baseUrl}/api/admin/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
    const responses = await Promise.all(Array.from({ length: 10 }, () => req()));
    const statuses = responses.map((r) => r.status);
    assert.equal(statuses.some((s) => s === 409), true);
    assert.equal(statuses.some((s) => s === 503), true);
  });
});

test("degraded dependency branch coverage on out-of-sequence workflow calls", async () => {
  await withServer(async (baseUrl) => {
    const token = await authToken(baseUrl);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const resolve = await fetch(`${baseUrl}/api/disputes/not-real/resolve`, {
      method: "POST",
      headers,
      body: JSON.stringify({ resolvedOutcomeIndex: 0, resolvedBy: validPayload.claimantAddress }),
    });
    assert.equal(resolve.status, 503);

    const submit = await fetch(`${baseUrl}/api/escrows/not-real/claims/not-real/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ merkleProof: [validPayload.proof[0]] }),
    });
    assert.equal(submit.status, 503);
  });
});
