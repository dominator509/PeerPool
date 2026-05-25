import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CaseDef = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  repeatProofTo?: number;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");
const payloadPath = path.join(repoRoot, "scripts", "src", "adhoc", "payloads", "phase2-mutation-cases.json");
const logPath = path.join(repoRoot, "qa", "logs", "phase2-data-mutation-log.json");

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

async function main(): Promise<void> {
  const cases = JSON.parse(await fs.readFile(payloadPath, "utf8")) as CaseDef[];
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

  const results: Array<Record<string, unknown>> = [];
  try {
    await waitReady(baseUrl, child);
    for (const testCase of cases) {
      const startedAt = Date.now();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(testCase.headers ?? {}),
      };

      const body =
        typeof testCase.repeatProofTo === "number" && testCase.body && typeof testCase.body === "object"
          ? {
              ...(testCase.body as Record<string, unknown>),
              proof: Array.from(
                { length: testCase.repeatProofTo },
                () => "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              ),
            }
          : testCase.body;

      const response = await fetch(`${baseUrl}${testCase.path}`, {
        method: testCase.method,
        headers,
        body: testCase.method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
      const raw = await response.text();
      const leakSignal =
        /Error:|TypeError|ReferenceError|SyntaxError|at\s+[A-Za-z0-9_.]+\s+\(/.test(raw) || raw.includes("stack");
      results.push({
        name: testCase.name,
        method: testCase.method,
        path: testCase.path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        contentType: response.headers.get("content-type"),
        responseSnippet: raw.slice(0, 200),
        stackLeakInBody: leakSignal,
      });
    }
  } finally {
    child.kill();
  }

  const report = {
    phase: 2,
    executedAt: new Date().toISOString(),
    caseCount: results.length,
    serverExitedUnexpectedly: child.exitCode !== null && child.exitCode !== 0,
    stderrSnippet: stderr.slice(0, 1000),
    results,
  };
  await fs.writeFile(logPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`PHASE2_LOG_WRITTEN ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
