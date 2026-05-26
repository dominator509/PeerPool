import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthenticatedSession } from "./common/auth";
import { startBlackBoxServer } from "./common/server";

type CaseOutcome = "pass" | "fail" | "skipped";

interface CaseResult {
  id: string;
  partition: "valid" | "invalid" | "boundary";
  method: string;
  endpoint: string;
  expectedStatuses: number[];
  actualStatus: number | null;
  outcome: CaseOutcome;
  durationMs: number;
  notes: string;
  responseSample: string;
}

interface PayloadModel {
  manifest: {
    valid: Record<string, unknown>;
    missingRequired: Record<string, unknown>;
    longTitleLength: number;
  };
  escrow: {
    valid: Record<string, unknown>;
    negativeAmount: Record<string, unknown>;
    missingManifestId: Record<string, unknown>;
  };
  participant: {
    invalidRole: Record<string, unknown>;
  };
  vote: {
    negativeOutcomeIndex: Record<string, unknown>;
  };
  claim: {
    negativeAmount: Record<string, unknown>;
  };
  query: {
    limitValid: number;
    limitNegative: number;
  };
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const payloadPath = path.join(
  repoRoot,
  "scripts",
  "src",
  "tests",
  "blackbox",
  "payloads",
  "phase2-equivalence-cases.json",
);
const logPath = path.join(repoRoot, "qa", "logs", "phase2-equivalence-boundary-log.json");

function parseJsonSafely(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function captureResponse(response: Response): Promise<{
  status: number;
  body: unknown;
  sample: string;
}> {
  const text = await response.text();
  const body = parseJsonSafely(text);
  const sample =
    text.length > 300 ? `${text.slice(0, 300)}...<truncated:${text.length - 300}>` : text;

  return {
    status: response.status,
    body,
    sample,
  };
}

async function runCase(
  resultList: CaseResult[],
  config: {
    id: string;
    partition: "valid" | "invalid" | "boundary";
    method: string;
    endpoint: string;
    expectedStatuses: number[];
    execute: () => Promise<Response>;
    validate?: (status: number, body: unknown) => { ok: boolean; note: string };
  },
): Promise<{ status: number | null; body: unknown }> {
  const startedAt = Date.now();
  try {
    const response = await config.execute();
    const captured = await captureResponse(response);
    const expectedStatus = config.expectedStatuses.includes(captured.status);
    const extra = config.validate?.(captured.status, captured.body);
    const pass = expectedStatus && (extra?.ok ?? true);

    resultList.push({
      id: config.id,
      partition: config.partition,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: captured.status,
      outcome: pass ? "pass" : "fail",
      durationMs: Date.now() - startedAt,
      notes: extra?.note ?? (pass ? "Status and response checks passed" : "Unexpected status"),
      responseSample: captured.sample,
    });

    return {
      status: captured.status,
      body: captured.body,
    };
  } catch (error) {
    resultList.push({
      id: config.id,
      partition: config.partition,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: null,
      outcome: "fail",
      durationMs: Date.now() - startedAt,
      notes: `Execution error: ${String(error)}`,
      responseSample: "",
    });
    return { status: null, body: null };
  }
}

function skipCase(
  resultList: CaseResult[],
  id: string,
  method: string,
  endpoint: string,
  partition: "valid" | "invalid" | "boundary",
  reason: string,
): void {
  resultList.push({
    id,
    partition,
    method,
    endpoint,
    expectedStatuses: [],
    actualStatus: null,
    outcome: "skipped",
    durationMs: 0,
    notes: reason,
    responseSample: "",
  });
}

async function main(): Promise<void> {
  const payload = JSON.parse(await fs.readFile(payloadPath, "utf8")) as PayloadModel;
  const results: CaseResult[] = [];
  const server = await startBlackBoxServer();
  const startedAt = Date.now();

  try {
    const session = await createAuthenticatedSession(server.baseUrl);
    const authHeaders = {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };
    const ts = Date.now();
    let manifestId: string | null = null;
    let escrowId: string | null = null;

    await runCase(results, {
      id: "p2.auth.nonce.invalid-address",
      partition: "invalid",
      method: "GET",
      endpoint: "/api/auth/nonce?address=not-an-address",
      expectedStatuses: [400],
      execute: () => fetch(`${server.baseUrl}/api/auth/nonce?address=not-an-address`),
      validate: (_status, body) => {
        const ok = typeof (body as { error?: unknown })?.error === "string";
        return { ok, note: ok ? "Invalid address rejected" : "Missing error field" };
      },
    });

    const validManifest = {
      ...payload.manifest.valid,
      title: `${String(payload.manifest.valid.title)} ${ts}`,
      createdBy: session.address,
    };
    const validManifestResult = await runCase(results, {
      id: "p2.manifest.valid-create",
      partition: "valid",
      method: "POST",
      endpoint: "/api/manifests",
      expectedStatuses: [201],
      execute: () =>
        fetch(`${server.baseUrl}/api/manifests`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(validManifest),
        }),
      validate: (_status, body) => {
        const ok = typeof (body as { id?: unknown })?.id === "string";
        return { ok, note: ok ? "Manifest created" : "Manifest response missing id" };
      },
    });

    if (validManifestResult.status === 201) {
      manifestId = (validManifestResult.body as { id: string }).id;
    }

    await runCase(results, {
      id: "p2.manifest.invalid-missing-required",
      partition: "invalid",
      method: "POST",
      endpoint: "/api/manifests",
      expectedStatuses: [400],
      execute: () =>
        fetch(`${server.baseUrl}/api/manifests`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            ...payload.manifest.missingRequired,
            createdBy: session.address,
          }),
        }),
      validate: (_status, body) => {
        const ok = typeof (body as { error?: unknown })?.error === "string";
        return { ok, note: ok ? "Missing required field rejected" : "Error payload missing" };
      },
    });

    await runCase(results, {
      id: "p2.manifest.boundary-long-title",
      partition: "boundary",
      method: "POST",
      endpoint: "/api/manifests",
      expectedStatuses: [201, 400, 413],
      execute: () =>
        fetch(`${server.baseUrl}/api/manifests`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            ...payload.manifest.valid,
            title: "T".repeat(payload.manifest.longTitleLength),
            createdBy: session.address,
          }),
        }),
      validate: (status) => {
        const ok = status !== 500;
        return { ok, note: ok ? "Boundary handled without server crash" : "Unexpected 500" };
      },
    });

    if (!manifestId) {
      skipCase(
        results,
        "p2.escrow.valid-create",
        "POST",
        "/api/escrows",
        "valid",
        "Skipped because valid manifest was not created",
      );
      skipCase(
        results,
        "p2.escrow.invalid-negative-total",
        "POST",
        "/api/escrows",
        "invalid",
        "Skipped because valid manifest was not created",
      );
      skipCase(
        results,
        "p2.escrow.invalid-missing-manifest",
        "POST",
        "/api/escrows",
        "invalid",
        "Skipped because valid manifest was not created",
      );
    } else {
      const validEscrow = {
        ...payload.escrow.valid,
        title: `${String(payload.escrow.valid.title)} ${ts}`,
        creatorAddress: session.address,
        manifestId,
      };
      const validEscrowResult = await runCase(results, {
        id: "p2.escrow.valid-create",
        partition: "valid",
        method: "POST",
        endpoint: "/api/escrows",
        expectedStatuses: [201],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(validEscrow),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { id?: unknown })?.id === "string";
          return { ok, note: ok ? "Escrow created" : "Escrow response missing id" };
        },
      });

      if (validEscrowResult.status === 201) {
        escrowId = (validEscrowResult.body as { id: string }).id;
      }

      await runCase(results, {
        id: "p2.escrow.invalid-negative-total",
        partition: "invalid",
        method: "POST",
        endpoint: "/api/escrows",
        expectedStatuses: [400],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ...payload.escrow.negativeAmount,
              creatorAddress: session.address,
              manifestId,
            }),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { error?: unknown })?.error === "string";
          return { ok, note: ok ? "Negative amount rejected" : "Error payload missing" };
        },
      });

      await runCase(results, {
        id: "p2.escrow.invalid-missing-manifest",
        partition: "invalid",
        method: "POST",
        endpoint: "/api/escrows",
        expectedStatuses: [400],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              ...payload.escrow.missingManifestId,
              creatorAddress: session.address,
            }),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { error?: unknown })?.error === "string";
          return { ok, note: ok ? "Missing manifest rejected" : "Error payload missing" };
        },
      });
    }

    await runCase(results, {
      id: "p2.escrow.boundary-list-limit-valid",
      partition: "boundary",
      method: "GET",
      endpoint: `/api/escrows?limit=${payload.query.limitValid}&offset=0`,
      expectedStatuses: [200],
      execute: () =>
        fetch(`${server.baseUrl}/api/escrows?limit=${payload.query.limitValid}&offset=0`),
      validate: (_status, body) => {
        const itemCount = Array.isArray((body as { items?: unknown })?.items)
          ? (body as { items: unknown[] }).items.length
          : -1;
        const ok = itemCount >= 0 && itemCount <= payload.query.limitValid;
        return { ok, note: ok ? "List limit respected" : `Unexpected item count: ${itemCount}` };
      },
    });

    await runCase(results, {
      id: "p2.escrow.boundary-list-limit-negative",
      partition: "boundary",
      method: "GET",
      endpoint: `/api/escrows?limit=${payload.query.limitNegative}&offset=0`,
      expectedStatuses: [400, 200],
      execute: () =>
        fetch(`${server.baseUrl}/api/escrows?limit=${payload.query.limitNegative}&offset=0`),
      validate: (status) => {
        const ok = status !== 500;
        return {
          ok,
          note:
            status === 400
              ? "Negative limit rejected"
              : "Negative limit accepted/sanitized but service stayed stable",
        };
      },
    });

    if (!escrowId) {
      skipCase(
        results,
        "p2.participant.invalid-role",
        "POST",
        "/api/escrows/{id}/participants",
        "invalid",
        "Skipped because valid escrow was not created",
      );
      skipCase(
        results,
        "p2.vote.invalid-negative-outcome",
        "POST",
        "/api/escrows/{id}/votes",
        "invalid",
        "Skipped because valid escrow was not created",
      );
      skipCase(
        results,
        "p2.claim.invalid-negative-amount",
        "POST",
        "/api/escrows/{id}/claims",
        "invalid",
        "Skipped because valid escrow was not created",
      );
    } else {
      await runCase(results, {
        id: "p2.participant.invalid-role",
        partition: "invalid",
        method: "POST",
        endpoint: "/api/escrows/{id}/participants",
        expectedStatuses: [400],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${escrowId}/participants`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(payload.participant.invalidRole),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { error?: unknown })?.error === "string";
          return { ok, note: ok ? "Invalid role rejected" : "Error payload missing" };
        },
      });

      await runCase(results, {
        id: "p2.vote.invalid-negative-outcome",
        partition: "invalid",
        method: "POST",
        endpoint: "/api/escrows/{id}/votes",
        expectedStatuses: [400],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${escrowId}/votes`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(payload.vote.negativeOutcomeIndex),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { error?: unknown })?.error === "string";
          return { ok, note: ok ? "Negative outcome index rejected" : "Error payload missing" };
        },
      });

      await runCase(results, {
        id: "p2.claim.invalid-negative-amount",
        partition: "invalid",
        method: "POST",
        endpoint: "/api/escrows/{id}/claims",
        expectedStatuses: [400],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${escrowId}/claims`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify(payload.claim.negativeAmount),
          }),
        validate: (_status, body) => {
          const ok = typeof (body as { error?: unknown })?.error === "string";
          return { ok, note: ok ? "Negative claim amount rejected" : "Error payload missing" };
        },
      });
    }
  } finally {
    server.stop();
  }

  const passed = results.filter((item) => item.outcome === "pass").length;
  const failed = results.filter((item) => item.outcome === "fail").length;
  const skipped = results.filter((item) => item.outcome === "skipped").length;

  const report = {
    phase: 2,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totals: {
      total: results.length,
      passed,
      failed,
      skipped,
    },
    results,
  };

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(report, null, 2));

  console.log("PHASE_2_EQUIVALENCE_BOUNDARY_RESULTS");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved phase report -> ${path.relative(repoRoot, logPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

