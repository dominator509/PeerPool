import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const apiEntry = path.join(repoRoot, "artifacts", "api-server", "dist", "index.mjs");
const webDist = path.join(repoRoot, "artifacts", "peerpool-web", "dist", "public");
const defaultDatabaseUrl = "postgres://peerpool:peerpool@127.0.0.1:1/peerpool";
const writeDb = process.env.SMOKE_WRITE_DB === "1";

interface NonceResponse {
  nonce: string;
  issuedAt: string;
  message: string;
  address: string;
}

interface VerifyResponse {
  token: string;
  address: string;
  expiresIn: number;
}

function assert(condition: unknown, message: string): asserts condition {
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
      assert(address && typeof address === "object", "Could not allocate a smoke-test port");
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, process: ChildProcess): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 15_000) {
    if (process.exitCode !== null) {
      throw new Error(`Server exited before becoming ready with code ${process.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for server: ${String(lastError)}`);
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  assert(
    contentType.includes("application/json"),
    `Expected JSON from ${response.url}, got ${contentType || "no content-type"}`,
  );
  return (await response.json()) as T;
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(url, init);
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} from ${url}, got ${response.status}: ${await response.text()}`,
    );
  }
  return readJson<T>(response);
}

async function runSmokeChecks(baseUrl: string): Promise<void> {
  const health = await requestJson<{ status: string }>(`${baseUrl}/api/healthz`);
  assert(health.status === "ok", "Health check did not return ok");

  const missingApi = await fetch(`${baseUrl}/api/not-a-real-route`);
  assert(missingApi.status === 404, "Unknown API route should return 404");
  await readJson<{ error: string }>(missingApi);

  const escrowsApi = await fetch(`${baseUrl}/api/escrows?limit=1&offset=0`);
  const escrowsBody = await escrowsApi.text();
  assert(
    !escrowsBody.trimStart().startsWith("<!DOCTYPE html>"),
    "/api/escrows returned frontend HTML instead of API JSON",
  );
  assert(
    (escrowsApi.headers.get("content-type") ?? "").includes("application/json"),
    "/api/escrows should return JSON, even when the database is unavailable",
  );

  const spaResponse = await fetch(`${baseUrl}/escrows`);
  const spaHtml = await spaResponse.text();
  assert(spaResponse.ok, "SPA route /escrows did not return 200");
  assert(spaHtml.includes('<div id="root"></div>'), "SPA shell is missing the root element");
  assert(!/Made in Replit|Made in replit|devBanner/.test(spaHtml), "Replit banner leaked into HTML");

  const scriptMatch = spaHtml.match(/<script[^>]+src="([^"]+\.js)"/);
  assert(scriptMatch?.[1], "SPA shell did not include a JavaScript entrypoint");

  const scriptResponse = await fetch(`${baseUrl}${scriptMatch[1]}`);
  assert(scriptResponse.ok, `SPA entrypoint ${scriptMatch[1]} did not return 200`);

  const account = privateKeyToAccount(
    "0x1111111111111111111111111111111111111111111111111111111111111111",
  );
  const nonce = await requestJson<NonceResponse>(
    `${baseUrl}/api/auth/nonce?address=${account.address}`,
  );
  assert(nonce.issuedAt && nonce.message.includes(nonce.issuedAt), "Nonce response omitted issuedAt");

  const signature = await account.signMessage({ message: nonce.message });
  const session = await requestJson<VerifyResponse>(
    `${baseUrl}/api/auth/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: account.address,
        signature,
        nonce: nonce.nonce,
      }),
    },
  );
  assert(session.token, "Auth verification did not return a session token");

  if (writeDb) {
    await runDatabaseWriteSmoke(baseUrl, session.token, account.address);
  }
}

async function runDatabaseWriteSmoke(
  baseUrl: string,
  token: string,
  address: string,
): Promise<void> {
  assert(
    process.env.DATABASE_URL,
    "SMOKE_WRITE_DB=1 requires DATABASE_URL so the test can create and list records",
  );

  const timestamp = Date.now();
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const manifest = await requestJson<{ id: string }>(
    `${baseUrl}/api/manifests`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: `Smoke Manifest ${timestamp}`,
        description: "Production smoke test manifest",
        createdBy: address,
        conditions: ["Smoke condition"],
        outcomes: [
          {
            index: 0,
            label: "Pass",
            description: "Smoke test passed",
            distributionBps: 10_000,
          },
          {
            index: 1,
            label: "Fail",
            description: "Smoke test failed",
            distributionBps: 0,
          },
        ],
      }),
    },
    201,
  );

  const escrow = await requestJson<{ id: string }>(
    `${baseUrl}/api/escrows`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: `Smoke Escrow ${timestamp}`,
        description: "Production smoke test escrow",
        chain: "ethereum",
        token: "0x0000000000000000000000000000000000000000",
        totalAmount: "1",
        creatorAddress: address,
        manifestId: manifest.id,
      }),
    },
    201,
  );

  const list = await requestJson<{ items: Array<{ id: string }> }>(
    `${baseUrl}/api/escrows?limit=25&offset=0`,
  );
  assert(
    list.items.some((item) => item.id === escrow.id),
    "Created escrow was not returned by list escrows",
  );
}

async function main(): Promise<void> {
  if (writeDb && !process.env.DATABASE_URL) {
    throw new Error("SMOKE_WRITE_DB=1 requires DATABASE_URL");
  }

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
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
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, server);
    await runSmokeChecks(baseUrl);
    console.log(`Production smoke test passed at ${baseUrl}`);
  } catch (error) {
    console.error(output.trim());
    throw error;
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
