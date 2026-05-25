import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");
const logPath = path.join(repoRoot, "qa", "logs", "phase4-persona-derailment-log.json");

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function findPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      must(addr && typeof addr === "object", "port allocation failed");
      server.close(() => resolve(addr.port));
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
  throw new Error("timeout waiting for server");
}

async function readBody(res: Response): Promise<string> {
  return (await res.text()).slice(0, 220);
}

async function authToken(baseUrl: string): Promise<string> {
  const account = privateKeyToAccount(
    "0x5555555555555555555555555555555555555555555555555555555555555555",
  );
  const nonceRes = await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`);
  const nonceBody = (await nonceRes.json()) as { nonce: string; message: string };
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
  const verifyBody = (await verifyRes.json()) as { token: string };
  return verifyBody.token;
}

async function main(): Promise<void> {
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

  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += c.toString();
  });

  try {
    await waitReady(baseUrl, child);
    const token = await authToken(baseUrl);
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const cases: Array<{
      name: string;
      request: () => Promise<Response>;
    }> = [
      {
        name: "resolve-dispute-before-create",
        request: () =>
          fetch(`${baseUrl}/api/disputes/not-real/resolve`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              resolvedOutcomeIndex: 0,
              resolvedBy: "0x1111111111111111111111111111111111111111",
            }),
          }),
      },
      {
        name: "escalate-dispute-before-create",
        request: () =>
          fetch(`${baseUrl}/api/disputes/not-real/escalate`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ chain: "ethereum" }),
          }),
      },
      {
        name: "submit-claim-before-claim-create",
        request: () =>
          fetch(`${baseUrl}/api/escrows/not-real/claims/not-real/submit`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ merkleProof: ["0xabc"] }),
          }),
      },
      {
        name: "settlement-before-escrow-create",
        request: () =>
          fetch(`${baseUrl}/api/escrows/not-real/settlement`, {
            method: "POST",
            headers: authHeaders,
            body: "{}",
          }),
      },
      {
        name: "logout-then-reuse-token",
        request: async () => {
          await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: authHeaders });
          return fetch(`${baseUrl}/api/manifests`, { method: "POST", headers: authHeaders, body: "{}" });
        },
      },
      {
        name: "expired-format-token-reuse",
        request: () =>
          fetch(`${baseUrl}/api/escrows`, {
            method: "POST",
            headers: { Authorization: "Bearer deadbeef", "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "bad",
              chain: "ethereum",
              token: "0x0000000000000000000000000000000000000000",
              totalAmount: "1",
              creatorAddress: "0x1111111111111111111111111111111111111111",
              manifestId: "x",
            }),
          }),
      },
    ];

    const outcomes: Array<Record<string, unknown>> = [];
    for (const c of cases) {
      const res = await c.request();
      outcomes.push({
        name: c.name,
        status: res.status,
        contentType: res.headers.get("content-type"),
        bodySnippet: await readBody(res),
      });
    }

    const report = {
      phase: 4,
      executedAt: new Date().toISOString(),
      outcomes,
      serverExitedUnexpectedly: child.exitCode !== null && child.exitCode !== 0,
      stderrSnippet: stderr.slice(0, 1000),
    };

    await fs.writeFile(logPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`PHASE4_LOG_WRITTEN ${logPath}`);
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
