import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthenticatedSession } from "./common/auth";
import { startBlackBoxServer } from "./common/server";

type Outcome = "pass" | "fail";

interface NegativeCaseResult {
  id: string;
  category: "malformed" | "auth" | "sequence" | "content-type" | "fuzz";
  method: string;
  endpoint: string;
  expectedStatuses: number[];
  actualStatus: number | null;
  outcome: Outcome;
  durationMs: number;
  leakDetected: boolean;
  leakSignals: string[];
  assertion: string;
  responseSample: string;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const outputPath = path.join(repoRoot, "qa", "logs", "phase4-negative-leakage-log.json");

const leakPatterns: Array<{ id: string; regex: RegExp }> = [
  { id: "stack-trace", regex: /\bat\s+[A-Za-z0-9_$<>\.]+\s*\([^)]*:\d+:\d+\)/ },
  { id: "file-path", regex: /[A-Za-z]:\\[^"'\n]+|\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/ },
  { id: "node-modules", regex: /node_modules/i },
  { id: "framework-version", regex: /(express|vite|drizzle|typeorm|sequelize)@?\d+\.\d+/i },
  {
    id: "sql-schema",
    regex: /(select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|relation\s+\".+\"\s+does\s+not\s+exist|column\s+\".+\")/i,
  },
  { id: "runtime-error", regex: /(TypeError|ReferenceError|SyntaxError|UnhandledPromiseRejection)/ },
];

function findLeakSignals(responseText: string): string[] {
  const hits: string[] = [];
  for (const pattern of leakPatterns) {
    if (pattern.regex.test(responseText)) {
      hits.push(pattern.id);
    }
  }
  return hits;
}

function sampleText(value: string): string {
  return value.length > 360 ? `${value.slice(0, 360)}...<truncated:${value.length - 360}>` : value;
}

function bodyLooksGenericError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const asRecord = body as Record<string, unknown>;
  return (
    (typeof asRecord.error === "string" && asRecord.error.length > 0) ||
    (typeof asRecord.message === "string" && asRecord.message.length > 0)
  );
}

async function runNegativeCase(
  results: NegativeCaseResult[],
  config: {
    id: string;
    category: NegativeCaseResult["category"];
    method: string;
    endpoint: string;
    expectedStatuses: number[];
    execute: () => Promise<Response>;
    extraValidation?: (status: number, body: unknown) => { ok: boolean; message: string };
  },
): Promise<void> {
  const startedAt = Date.now();
  try {
    const response = await config.execute();
    const raw = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = null;
    }

    const leakSignals = findLeakSignals(raw);
    const leakDetected = leakSignals.length > 0;
    const statusOk = config.expectedStatuses.includes(response.status);
    const errorShapeOk = bodyLooksGenericError(body) || response.status === 200;
    const extra = config.extraValidation?.(response.status, body) ?? {
      ok: true,
      message: "No extra validation required",
    };

    const passed = statusOk && !leakDetected && errorShapeOk && extra.ok;

    results.push({
      id: config.id,
      category: config.category,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: response.status,
      outcome: passed ? "pass" : "fail",
      durationMs: Date.now() - startedAt,
      leakDetected,
      leakSignals,
      assertion: passed
        ? "Rejected safely with no sensitive leakage"
        : `Status/leakage/assertion failure (${extra.message})`,
      responseSample: sampleText(raw),
    });
  } catch (error) {
    results.push({
      id: config.id,
      category: config.category,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: null,
      outcome: "fail",
      durationMs: Date.now() - startedAt,
      leakDetected: false,
      leakSignals: [],
      assertion: `Execution error: ${String(error)}`,
      responseSample: "",
    });
  }
}

async function main(): Promise<void> {
  const server = await startBlackBoxServer();
  const startedAt = Date.now();
  const results: NegativeCaseResult[] = [];

  try {
    const session = await createAuthenticatedSession(server.baseUrl);
    const authHeaders = {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };

    await runNegativeCase(results, {
      id: "p4.malformed.auth-verify-invalid-json",
      category: "malformed",
      method: "POST",
      endpoint: "/api/auth/verify",
      expectedStatuses: [400, 415, 422],
      execute: () =>
        fetch(`${server.baseUrl}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{\"address\":\"0xabc\",",
        }),
    });

    await runNegativeCase(results, {
      id: "p4.contenttype.manifest-text-plain",
      category: "content-type",
      method: "POST",
      endpoint: "/api/manifests",
      expectedStatuses: [400, 415, 422],
      execute: () =>
        fetch(`${server.baseUrl}/api/manifests`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "text/plain",
          },
          body: "this is not json",
        }),
    });

    await runNegativeCase(results, {
      id: "p4.auth.admin-sync-invalid-token",
      category: "auth",
      method: "POST",
      endpoint: "/api/admin/sync",
      expectedStatuses: [401, 403],
      execute: () =>
        fetch(`${server.baseUrl}/api/admin/sync`, {
          method: "POST",
          headers: {
            Authorization: "Bearer invalid.token.value",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
    });

    await runNegativeCase(results, {
      id: "p4.auth.create-escrow-missing-token",
      category: "auth",
      method: "POST",
      endpoint: "/api/escrows",
      expectedStatuses: [401, 403],
      execute: () =>
        fetch(`${server.baseUrl}/api/escrows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Unauthorized Escrow",
            chain: "ethereum",
            token: "0x0000000000000000000000000000000000000000",
            totalAmount: "1",
            creatorAddress: "0x1111111111111111111111111111111111111111",
            manifestId: "missing",
          }),
        }),
    });

    await runNegativeCase(results, {
      id: "p4.sequence.submit-claim-out-of-order",
      category: "sequence",
      method: "POST",
      endpoint: "/api/escrows/non-existent/claims/non-existent/submit",
      expectedStatuses: [400, 404],
      execute: () =>
        fetch(`${server.baseUrl}/api/escrows/non-existent/claims/non-existent/submit`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ merkleProof: ["0xabc"] }),
        }),
    });

    await runNegativeCase(results, {
      id: "p4.sequence.resolve-dispute-out-of-order",
      category: "sequence",
      method: "POST",
      endpoint: "/api/disputes/non-existent/resolve",
      expectedStatuses: [400, 404],
      execute: () =>
        fetch(`${server.baseUrl}/api/disputes/non-existent/resolve`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            resolvedOutcomeIndex: 0,
            resolvedBy: session.address,
          }),
        }),
    });

    await runNegativeCase(results, {
      id: "p4.malformed.settlement-verify-bad-shape",
      category: "malformed",
      method: "POST",
      endpoint: "/api/escrows/escrow-x/settlement/verify",
      expectedStatuses: [400],
      execute: () =>
        fetch(`${server.baseUrl}/api/escrows/escrow-x/settlement/verify`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            claimantAddress: "0x1111111111111111111111111111111111111111",
            amount: "1",
            proof: "not-an-array",
            merkleRoot: "0xabc",
          }),
        }),
    });

    await runNegativeCase(results, {
      id: "p4.fuzz.query-state-sqli-pattern",
      category: "fuzz",
      method: "GET",
      endpoint: "/api/escrows?state=' OR 1=1--",
      expectedStatuses: [200, 400],
      execute: () => fetch(`${server.baseUrl}/api/escrows?state=' OR 1=1--`),
      extraValidation: (status, body) => {
        if (status === 200) {
          const ok = Array.isArray((body as { items?: unknown })?.items);
          return { ok, message: ok ? "Returned structured list" : "Missing list shape" };
        }
        return { ok: true, message: "Rejected fuzz input" };
      },
    });
  } finally {
    server.stop();
  }

  const totals = {
    total: results.length,
    passed: results.filter((item) => item.outcome === "pass").length,
    failed: results.filter((item) => item.outcome === "fail").length,
    criticalLeaks: results.filter((item) => item.leakDetected).length,
  };

  const report = {
    phase: 4,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totals,
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log("PHASE_4_NEGATIVE_LEAKAGE_RESULTS");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved phase report -> ${path.relative(repoRoot, outputPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

