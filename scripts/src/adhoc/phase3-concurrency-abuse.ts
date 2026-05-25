import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");
const logPath = path.join(repoRoot, "qa", "logs", "phase3-concurrency-log.json");

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

async function getAuthToken(baseUrl: string): Promise<string> {
  const account = privateKeyToAccount(
    "0x4444444444444444444444444444444444444444444444444444444444444444",
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
    const token = await getAuthToken(baseUrl);

    const sessionStorm = await Promise.all(
      Array.from({ length: 60 }, () =>
        fetch(`${baseUrl}/api/auth/session`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.status),
      ),
    );

    const syncStorm = await Promise.all(
      Array.from({ length: 30 }, () =>
        fetch(`${baseUrl}/api/admin/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }).then(async (r) => ({
          status: r.status,
          body: await r.text(),
        })),
      ),
    );

    const abortControllers = Array.from({ length: 10 }, () => new AbortController());
    const aborted = await Promise.all(
      abortControllers.map(async (controller) => {
        const request = fetch(`${baseUrl}/api/escrows/fake/settlement/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimantAddress: "0x1111111111111111111111111111111111111111",
            amount: "1",
            merkleRoot: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            proof: Array.from({ length: 3000 }, () => "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
          }),
          signal: controller.signal,
        })
          .then((r) => ({ outcome: "resolved", status: r.status }))
          .catch((e) => ({ outcome: "rejected", error: String(e) }));
        setTimeout(() => controller.abort(), 5);
        return request;
      }),
    );

    const statusRes = await fetch(`${baseUrl}/api/admin/indexer`);
    const statusBody = await statusRes.text();

    const report = {
      phase: 3,
      executedAt: new Date().toISOString(),
      sessionStorm: {
        total: sessionStorm.length,
        byStatus: Object.fromEntries(
          [...new Set(sessionStorm)].map((s) => [s, sessionStorm.filter((x) => x === s).length]),
        ),
      },
      syncStorm: {
        total: syncStorm.length,
        byStatus: Object.fromEntries(
          [...new Set(syncStorm.map((x) => x.status))].map((s) => [
            s,
            syncStorm.filter((x) => x.status === s).length,
          ]),
        ),
        sampleBodies: syncStorm.slice(0, 3).map((x) => x.body.slice(0, 180)),
      },
      abortedRequests: {
        total: aborted.length,
        rejected: aborted.filter((x) => x.outcome === "rejected").length,
        resolved: aborted.filter((x) => x.outcome === "resolved").length,
      },
      indexerStatusStatusCode: statusRes.status,
      indexerStatusBodySnippet: statusBody.slice(0, 200),
      serverExitedUnexpectedly: child.exitCode !== null && child.exitCode !== 0,
      stderrSnippet: stderr.slice(0, 1000),
    };

    await fs.writeFile(logPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`PHASE3_LOG_WRITTEN ${logPath}`);
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
