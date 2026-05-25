import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
);

const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");
const defaultDatabaseUrl = "postgres://peerpool:peerpool@127.0.0.1:54329/peerpool";

export interface ServerHandle {
  baseUrl: string;
  stop: () => void;
  collectOutput: () => string;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assertCondition(address && typeof address === "object", "Could not allocate test port");
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl: string, child: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 20_000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before ready with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
      lastError = new Error(`Health endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for server readiness: ${String(lastError)}`);
}

export async function startBlackBoxServer(): Promise<ServerHandle> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      PEERPOOL_WEB_DIST: webDist,
      DATABASE_URL: process.env.DATABASE_URL ?? defaultDatabaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForServer(baseUrl, child);

  return {
    baseUrl,
    stop: () => {
      child.kill();
    },
    collectOutput: () => output,
  };
}

export function assertJsonContentType(response: Response): void {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON content-type from ${response.url}, got "${contentType || "missing"}"`,
    );
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  assertJsonContentType(response);
  return (await response.json()) as T;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<{
  status: number;
  body: T;
  headers: Headers;
}> {
  const response = await fetch(url, init);
  const body = await readJson<T>(response);
  return {
    status: response.status,
    body,
    headers: response.headers,
  };
}

