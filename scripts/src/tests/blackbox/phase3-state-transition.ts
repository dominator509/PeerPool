import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthenticatedSession } from "./common/auth";
import { readJson, startBlackBoxServer } from "./common/server";

type StepOutcome = "pass" | "fail" | "skipped";

interface StepResult {
  id: string;
  step: string;
  method: string;
  endpoint: string;
  expectedStatuses: number[];
  actualStatus: number | null;
  outcome: StepOutcome;
  durationMs: number;
  assertion: string;
  responseSample: string;
}

interface JourneyState {
  authAddress: string;
  token: string;
  manifestId: string;
  escrowId: string;
  participantId: string;
  voteId: string;
  claimId: string;
  settlementRoot: string;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const outputPath = path.join(repoRoot, "qa", "logs", "phase3-state-transition-log.json");

function stringifySample(value: unknown): string {
  const raw = JSON.stringify(value);
  if (!raw) return "";
  return raw.length > 320 ? `${raw.slice(0, 320)}...<truncated:${raw.length - 320}>` : raw;
}

async function runStep<T>(
  results: StepResult[],
  config: {
    id: string;
    step: string;
    method: string;
    endpoint: string;
    expectedStatuses: number[];
    execute: () => Promise<Response>;
    assertBody: (status: number, body: T) => { ok: boolean; message: string };
  },
): Promise<{ status: number | null; body: T | null }> {
  const startedAt = Date.now();
  try {
    const response = await config.execute();
    const status = response.status;
    const body = (await readJson<T>(response)) as T;
    const baseStatusOk = config.expectedStatuses.includes(status);
    const assertionResult = config.assertBody(status, body);
    const pass = baseStatusOk && assertionResult.ok;

    results.push({
      id: config.id,
      step: config.step,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: status,
      outcome: pass ? "pass" : "fail",
      durationMs: Date.now() - startedAt,
      assertion: assertionResult.message,
      responseSample: stringifySample(body),
    });

    return { status, body };
  } catch (error) {
    results.push({
      id: config.id,
      step: config.step,
      method: config.method,
      endpoint: config.endpoint,
      expectedStatuses: config.expectedStatuses,
      actualStatus: null,
      outcome: "fail",
      durationMs: Date.now() - startedAt,
      assertion: `Execution error: ${String(error)}`,
      responseSample: "",
    });
    return { status: null, body: null };
  }
}

function skipStep(results: StepResult[], step: Omit<StepResult, "outcome" | "durationMs">): void {
  results.push({
    ...step,
    outcome: "skipped",
    durationMs: 0,
  });
}

async function main(): Promise<void> {
  const server = await startBlackBoxServer();
  const startedAt = Date.now();
  const results: StepResult[] = [];
  const state: Partial<JourneyState> = {};

  try {
    const session = await createAuthenticatedSession(server.baseUrl);
    state.token = session.token;
    state.authAddress = session.address;
    const authHeaders = {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };
    const runId = Date.now();

    const authSession = await runStep<{ address: string; valid?: boolean }>(results, {
      id: "p3.workflow.auth-session",
      step: "Retrieve authenticated session from bearer token",
      method: "GET",
      endpoint: "/api/auth/session",
      expectedStatuses: [200],
      execute: () =>
        fetch(`${server.baseUrl}/api/auth/session`, {
          headers: { Authorization: `Bearer ${session.token}` },
        }),
      assertBody: (_status, body) => {
        const ok = body.address.toLowerCase() === session.address.toLowerCase();
        return {
          ok,
          message: ok ? "Session address matches authenticated wallet" : "Session address mismatch",
        };
      },
    });

    const manifestCreate = await runStep<{ id: string; title: string }>(results, {
      id: "p3.workflow.create-manifest",
      step: "Create manifest then capture manifestId",
      method: "POST",
      endpoint: "/api/manifests",
      expectedStatuses: [201],
      execute: () =>
        fetch(`${server.baseUrl}/api/manifests`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            title: `StateFlow Manifest ${runId}`,
            description: "State transition verification manifest",
            createdBy: session.address,
            conditions: ["Deliverable accepted by majority reviewers"],
            outcomes: [
              {
                index: 0,
                label: "Approved",
                description: "Release 100%",
                distributionBps: 10_000,
              },
              {
                index: 1,
                label: "Rejected",
                description: "Release 0%",
                distributionBps: 0,
              },
            ],
          }),
        }),
      assertBody: (_status, body) => {
        const ok = typeof body.id === "string" && body.id.length > 0;
        return { ok, message: ok ? "Manifest created with stable id" : "Manifest id missing" };
      },
    });
    if (manifestCreate.body?.id) {
      state.manifestId = manifestCreate.body.id;
    }

    if (!state.manifestId) {
      skipStep(results, {
        id: "p3.workflow.create-escrow",
        step: "Create escrow bound to manifest",
        method: "POST",
        endpoint: "/api/escrows",
        expectedStatuses: [201],
        actualStatus: null,
        assertion: "Skipped due to missing manifestId",
        responseSample: "",
      });
    } else {
      const escrowCreate = await runStep<{ id: string; manifestId: string }>(results, {
        id: "p3.workflow.create-escrow",
        step: "Create escrow bound to manifest",
        method: "POST",
        endpoint: "/api/escrows",
        expectedStatuses: [201],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              title: `StateFlow Escrow ${runId}`,
              description: "Workflow continuity escrow",
              chain: "ethereum",
              token: "0x0000000000000000000000000000000000000000",
              totalAmount: "120",
              creatorAddress: session.address,
              manifestId: state.manifestId,
            }),
          }),
        assertBody: (_status, body) => {
          const ok = body.manifestId === state.manifestId && typeof body.id === "string";
          return {
            ok,
            message: ok
              ? "Escrow persisted with referenced manifestId"
              : "Escrow missing expected manifest linkage",
          };
        },
      });
      if (escrowCreate.body?.id) {
        state.escrowId = escrowCreate.body.id;
      }
    }

    if (!state.escrowId) {
      const skipped: Array<Omit<StepResult, "outcome" | "durationMs">> = [
        {
          id: "p3.workflow.get-escrow",
          step: "Fetch escrow by id and verify identity",
          method: "GET",
          endpoint: "/api/escrows/{id}",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.list-escrows",
          step: "List escrows and confirm created escrow appears",
          method: "GET",
          endpoint: "/api/escrows?limit=20&offset=0",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.add-participant",
          step: "Add participant to escrow",
          method: "POST",
          endpoint: "/api/escrows/{id}/participants",
          expectedStatuses: [201],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.list-participants",
          step: "List participants and verify added participant",
          method: "GET",
          endpoint: "/api/escrows/{id}/participants",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.submit-vote",
          step: "Submit vote on escrow outcome",
          method: "POST",
          endpoint: "/api/escrows/{id}/votes",
          expectedStatuses: [201],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.list-votes",
          step: "List votes and verify submitted vote",
          method: "GET",
          endpoint: "/api/escrows/{id}/votes",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.create-claim",
          step: "Create claim and capture claimId",
          method: "POST",
          endpoint: "/api/escrows/{id}/claims",
          expectedStatuses: [201],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.list-claims",
          step: "List claims and verify created claim",
          method: "GET",
          endpoint: "/api/escrows/{id}/claims",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.compute-settlement",
          step: "Compute settlement from escrow claims",
          method: "POST",
          endpoint: "/api/escrows/{id}/settlement",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
        {
          id: "p3.workflow.get-settlement",
          step: "Get settlement and verify Merkle root continuity",
          method: "GET",
          endpoint: "/api/escrows/{id}/settlement",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing escrowId",
          responseSample: "",
        },
      ];

      for (const item of skipped) {
        skipStep(results, item);
      }
    } else {
      await runStep<{ id: string; title: string }>(results, {
        id: "p3.workflow.get-escrow",
        step: "Fetch escrow by id and verify identity",
        method: "GET",
        endpoint: "/api/escrows/{id}",
        expectedStatuses: [200],
        execute: () => fetch(`${server.baseUrl}/api/escrows/${state.escrowId}`),
        assertBody: (_status, body) => {
          const ok = body.id === state.escrowId;
          return { ok, message: ok ? "Escrow id stable across fetch" : "Escrow id mismatch" };
        },
      });

      await runStep<{ items: Array<{ id: string }> }>(results, {
        id: "p3.workflow.list-escrows",
        step: "List escrows and confirm created escrow appears",
        method: "GET",
        endpoint: "/api/escrows?limit=20&offset=0",
        expectedStatuses: [200],
        execute: () => fetch(`${server.baseUrl}/api/escrows?limit=20&offset=0`),
        assertBody: (_status, body) => {
          const ok = body.items.some((item) => item.id === state.escrowId);
          return { ok, message: ok ? "Created escrow surfaced in list" : "Escrow missing from list" };
        },
      });

      const participantAddress = "0x1111111111111111111111111111111111111111";
      const addParticipant = await runStep<{ id: string; address: string }>(results, {
        id: "p3.workflow.add-participant",
        step: "Add participant to escrow",
        method: "POST",
        endpoint: "/api/escrows/{id}/participants",
        expectedStatuses: [201],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/participants`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              address: participantAddress,
              role: "beneficiary",
              fundedAmount: "0",
            }),
          }),
        assertBody: (_status, body) => {
          const ok = body.address.toLowerCase() === participantAddress.toLowerCase();
          return { ok, message: ok ? "Participant added with expected address" : "Participant address mismatch" };
        },
      });
      if (addParticipant.body?.id) {
        state.participantId = addParticipant.body.id;
      }

      await runStep<{ items: Array<{ id: string; address: string }> }>(results, {
        id: "p3.workflow.list-participants",
        step: "List participants and verify added participant",
        method: "GET",
        endpoint: "/api/escrows/{id}/participants",
        expectedStatuses: [200],
        execute: () => fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/participants`),
        assertBody: (_status, body) => {
          const ok = body.items.some((item) => item.id === state.participantId);
          return { ok, message: ok ? "Participant present in list response" : "Participant not listed" };
        },
      });

      const submitVote = await runStep<{ id: string; escrowId: string; outcomeIndex: number }>(results, {
        id: "p3.workflow.submit-vote",
        step: "Submit vote on escrow outcome",
        method: "POST",
        endpoint: "/api/escrows/{id}/votes",
        expectedStatuses: [201],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/votes`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              voterAddress: participantAddress,
              outcomeIndex: 0,
              weight: "1",
            }),
          }),
        assertBody: (_status, body) => {
          const ok = body.escrowId === state.escrowId && body.outcomeIndex === 0;
          return { ok, message: ok ? "Vote linked to expected escrow and outcome" : "Vote linkage mismatch" };
        },
      });
      if (submitVote.body?.id) {
        state.voteId = submitVote.body.id;
      }

      await runStep<{ items: Array<{ id: string }>; tally: Array<{ outcomeIndex: number; voteCount: number }> }>(
        results,
        {
          id: "p3.workflow.list-votes",
          step: "List votes and verify submitted vote",
          method: "GET",
          endpoint: "/api/escrows/{id}/votes",
          expectedStatuses: [200],
          execute: () => fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/votes`),
          assertBody: (_status, body) => {
            const inItems = body.items.some((item) => item.id === state.voteId);
            const tallyHasOutcome = body.tally.some((item) => item.outcomeIndex === 0 && item.voteCount >= 1);
            const ok = inItems && tallyHasOutcome;
            return { ok, message: ok ? "Vote and tally persisted across read path" : "Vote/tally continuity failed" };
          },
        },
      );

      const createClaim = await runStep<{ id: string; escrowId: string; amount: string }>(results, {
        id: "p3.workflow.create-claim",
        step: "Create claim and capture claimId",
        method: "POST",
        endpoint: "/api/escrows/{id}/claims",
        expectedStatuses: [201],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/claims`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              claimantAddress: participantAddress,
              amount: "40",
            }),
          }),
        assertBody: (_status, body) => {
          const ok = body.escrowId === state.escrowId && body.amount === "40";
          return { ok, message: ok ? "Claim created with expected escrow and amount" : "Claim payload mismatch" };
        },
      });
      if (createClaim.body?.id) {
        state.claimId = createClaim.body.id;
      }

      await runStep<{ items: Array<{ id: string }> }>(results, {
        id: "p3.workflow.list-claims",
        step: "List claims and verify created claim",
        method: "GET",
        endpoint: "/api/escrows/{id}/claims",
        expectedStatuses: [200],
        execute: () => fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/claims`),
        assertBody: (_status, body) => {
          const ok = body.items.some((item) => item.id === state.claimId);
          return { ok, message: ok ? "Claim visible via list endpoint" : "Claim missing from list" };
        },
      });

      const computeSettlement = await runStep<{
        escrowId: string;
        merkleRoot: string;
        claimCount: number;
        leaves: Array<{ claimantAddress: string; amount: string; proof: string[] }>;
      }>(results, {
        id: "p3.workflow.compute-settlement",
        step: "Compute settlement from escrow claims",
        method: "POST",
        endpoint: "/api/escrows/{id}/settlement",
        expectedStatuses: [200],
        execute: () =>
          fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/settlement`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
          }),
        assertBody: (_status, body) => {
          const ok = body.escrowId === state.escrowId && body.claimCount >= 1;
          return {
            ok,
            message: ok ? "Settlement computed with at least one claim leaf" : "Settlement missing expected claim data",
          };
        },
      });
      if (computeSettlement.body?.merkleRoot) {
        state.settlementRoot = computeSettlement.body.merkleRoot;
      }

      const getSettlement = await runStep<{
        escrowId: string;
        merkleRoot: string;
        claimCount: number;
        leaves: Array<{ claimantAddress: string; amount: string; proof: string[] }>;
      }>(results, {
        id: "p3.workflow.get-settlement",
        step: "Get settlement and verify Merkle root continuity",
        method: "GET",
        endpoint: "/api/escrows/{id}/settlement",
        expectedStatuses: [200],
        execute: () => fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/settlement`),
        assertBody: (_status, body) => {
          const rootMatches = state.settlementRoot ? body.merkleRoot === state.settlementRoot : false;
          const hasLeaves = Array.isArray(body.leaves) && body.leaves.length >= 1;
          const ok = rootMatches && hasLeaves;
          return {
            ok,
            message: ok ? "Settlement root stable across compute->read workflow" : "Settlement root continuity mismatch",
          };
        },
      });

      const firstLeaf = getSettlement.body?.leaves?.[0];
      if (firstLeaf && state.settlementRoot) {
        await runStep<{ valid: boolean; escrowId: string; amount: string; claimantAddress: string }>(results, {
          id: "p3.workflow.verify-proof",
          step: "Verify Merkle proof generated in settlement response",
          method: "POST",
          endpoint: "/api/escrows/{id}/settlement/verify",
          expectedStatuses: [200],
          execute: () =>
            fetch(`${server.baseUrl}/api/escrows/${state.escrowId}/settlement/verify`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({
                claimantAddress: firstLeaf.claimantAddress,
                amount: firstLeaf.amount,
                proof: firstLeaf.proof,
                merkleRoot: state.settlementRoot,
              }),
            }),
          assertBody: (_status, body) => {
            const ok = body.valid === true && body.escrowId === state.escrowId;
            return { ok, message: ok ? "Proof verified against current settlement root" : "Proof verification failed" };
          },
        });
      } else {
        skipStep(results, {
          id: "p3.workflow.verify-proof",
          step: "Verify Merkle proof generated in settlement response",
          method: "POST",
          endpoint: "/api/escrows/{id}/settlement/verify",
          expectedStatuses: [200],
          actualStatus: null,
          assertion: "Skipped due to missing settlement leaf/root",
          responseSample: "",
        });
      }
    }

    if (!authSession.body) {
      throw new Error("Phase 3 could not establish authenticated session checks");
    }
  } finally {
    server.stop();
  }

  const totals = {
    total: results.length,
    passed: results.filter((item) => item.outcome === "pass").length,
    failed: results.filter((item) => item.outcome === "fail").length,
    skipped: results.filter((item) => item.outcome === "skipped").length,
  };

  const report = {
    phase: 3,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totals,
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log("PHASE_3_STATE_TRANSITION_RESULTS");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved phase report -> ${path.relative(repoRoot, outputPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

