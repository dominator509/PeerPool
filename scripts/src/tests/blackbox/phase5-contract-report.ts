import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface OperationEntry {
  operationId: string;
  method: string;
  path: string;
  summary: string;
}

interface PhaseResultEntry {
  id: string;
  method: string;
  endpoint: string;
  outcome: "pass" | "fail" | "skipped";
  actualStatus: number | null;
  notes?: string;
  assertion?: string;
  responseSample?: string;
}

interface PhaseLog {
  phase: number;
  totals: Record<string, number>;
  results: PhaseResultEntry[];
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const phase1MapPath = path.join(repoRoot, "qa", "logs", "phase1-external-interface-map.json");
const phase2LogPath = path.join(repoRoot, "qa", "logs", "phase2-equivalence-boundary-log.json");
const phase3LogPath = path.join(repoRoot, "qa", "logs", "phase3-state-transition-log.json");
const phase4LogPath = path.join(repoRoot, "qa", "logs", "phase4-negative-leakage-log.json");
const phase5SummaryPath = path.join(repoRoot, "qa", "logs", "phase5-coverage-summary.json");
const finalReportPath = path.join(repoRoot, "BLACK_BOX_CONTRACT_REPORT.md");

function pathTemplateToRegex(templatePath: string): RegExp {
  const escaped = templatePath
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

function normalizeEndpointToOperationPath(
  rawEndpoint: string,
  method: string,
  operations: OperationEntry[],
): string | null {
  const endpointPath = rawEndpoint.split("?")[0];
  const sameMethod = operations.filter((op) => op.method.toUpperCase() === method.toUpperCase());

  const exact = sameMethod.find((op) => op.path === endpointPath);
  if (exact) return exact.path;

  const matched = sameMethod.find((op) => pathTemplateToRegex(op.path).test(endpointPath));
  return matched?.path ?? null;
}

function keyFor(method: string, operationPath: string): string {
  return `${method.toUpperCase()} ${operationPath}`;
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function collectUnhandledExternalExceptions(allResults: PhaseResultEntry[]): PhaseResultEntry[] {
  return allResults.filter(
    (result) =>
      result.actualStatus === null ||
      (typeof result.actualStatus === "number" && result.actualStatus >= 500) ||
      (result.assertion?.toLowerCase().includes("execution error") ?? false),
  );
}

function collectDeviations(allResults: PhaseResultEntry[]): PhaseResultEntry[] {
  return allResults.filter((result) => result.outcome === "fail");
}

async function main(): Promise<void> {
  const phase1Map = await loadJson<{
    api: { documentedOperationCount: number; operations: OperationEntry[] };
  }>(phase1MapPath);
  const phase2 = await loadJson<PhaseLog>(phase2LogPath);
  const phase3 = await loadJson<PhaseLog>(phase3LogPath);
  const phase4 = await loadJson<PhaseLog & { totals: { criticalLeaks?: number } }>(phase4LogPath);

  const operations = phase1Map.api.operations;
  const documentedCount = phase1Map.api.documentedOperationCount;
  const allResults = [...phase2.results, ...phase3.results, ...phase4.results];

  const attemptedOperationKeys = new Set<string>();
  const successfulOperationKeys = new Set<string>();
  const unmatchedResults: Array<{ id: string; method: string; endpoint: string }> = [];

  for (const result of allResults) {
    const normalizedPath = normalizeEndpointToOperationPath(result.endpoint, result.method, operations);
    if (!normalizedPath) {
      unmatchedResults.push({
        id: result.id,
        method: result.method,
        endpoint: result.endpoint,
      });
      continue;
    }

    const key = keyFor(result.method, normalizedPath);
    attemptedOperationKeys.add(key);
    if (result.outcome === "pass") {
      successfulOperationKeys.add(key);
    }
  }

  const documentedKeys = operations.map((op) => keyFor(op.method, op.path));
  const untestedDocumentedKeys = documentedKeys.filter((key) => !attemptedOperationKeys.has(key));
  const unsuccessfullyTestedKeys = documentedKeys.filter(
    (key) => attemptedOperationKeys.has(key) && !successfulOperationKeys.has(key),
  );

  const successfulCoveragePct =
    documentedCount === 0 ? 0 : Number(((successfulOperationKeys.size / documentedCount) * 100).toFixed(2));
  const attemptedCoveragePct =
    documentedCount === 0 ? 0 : Number(((attemptedOperationKeys.size / documentedCount) * 100).toFixed(2));

  const unhandledExceptions = collectUnhandledExternalExceptions(allResults);
  const deviations = collectDeviations(allResults);

  const summary = {
    generatedAt: new Date().toISOString(),
    documentedOperationCount: documentedCount,
    attemptedOperationCount: attemptedOperationKeys.size,
    successfulOperationCount: successfulOperationKeys.size,
    attemptedCoveragePct,
    successfulCoveragePct,
    untestedDocumentedOperations: untestedDocumentedKeys,
    attemptedButNotSuccessfulOperations: unsuccessfullyTestedKeys,
    unmatchedObservedResults: unmatchedResults,
    unhandledExternalExceptions: unhandledExceptions.map((item) => ({
      id: item.id,
      method: item.method,
      endpoint: item.endpoint,
      actualStatus: item.actualStatus,
      assertion: item.assertion ?? item.notes ?? "",
    })),
    deviations: deviations.map((item) => ({
      id: item.id,
      method: item.method,
      endpoint: item.endpoint,
      actualStatus: item.actualStatus,
      assertion: item.assertion ?? item.notes ?? "",
      responseSample: item.responseSample ?? "",
    })),
    criticalLeakFindings: phase4.totals.criticalLeaks ?? 0,
    phaseTotals: {
      phase2: phase2.totals,
      phase3: phase3.totals,
      phase4: phase4.totals,
    },
  };

  const report = `# BLACK BOX CONTRACT REPORT

Generated: ${summary.generatedAt}

## Coverage Summary

- Documented OpenAPI operations: ${summary.documentedOperationCount}
- Attempted operations (observed via black-box suite): ${summary.attemptedOperationCount}
- Successfully tested operations: ${summary.successfulOperationCount}
- Attempted interface coverage: ${summary.attemptedCoveragePct}%
- Successful interface coverage: ${summary.successfulCoveragePct}%

## Phase Execution Totals

- Phase 2 (Equivalence/Boundary): ${phase2.totals.passed}/${phase2.totals.total} passed, ${phase2.totals.failed} failed
- Phase 3 (State Transition): ${phase3.totals.passed}/${phase3.totals.total} passed, ${phase3.totals.failed} failed
- Phase 4 (Negative/Leakage): ${phase4.totals.passed}/${phase4.totals.total} passed, ${phase4.totals.failed} failed

## Unhandled External Exceptions

${summary.unhandledExternalExceptions.length === 0
  ? "- None observed (no null-status executions and no 5xx outcomes in captured suite runs)."
  : summary.unhandledExternalExceptions
      .map(
        (item) =>
          `- ${item.id} | ${item.method} ${item.endpoint} | status=${String(item.actualStatus)} | ${item.assertion}`,
      )
      .join("\n")}

## Leakage Assertion

- Critical leakage findings: ${summary.criticalLeakFindings}
- Observation: responses did not expose stack traces, DB schema SQL text, or framework version details in the Phase 4 suite.

## Deviations From Expected External Contract

${summary.deviations.length === 0
  ? "- None."
  : summary.deviations
      .map(
        (item) =>
          `- ${item.id} | ${item.method} ${item.endpoint} | status=${String(item.actualStatus)} | ${item.assertion}`,
      )
      .join("\n")}

## Untested Documented Operations

${summary.untestedDocumentedOperations.length === 0
  ? "- None."
  : summary.untestedDocumentedOperations.map((item) => `- ${item}`).join("\n")}

## Attempted But Not Successfully Verified Operations

${summary.attemptedButNotSuccessfulOperations.length === 0
  ? "- None."
  : summary.attemptedButNotSuccessfulOperations.map((item) => `- ${item}`).join("\n")}
`;

  await fs.writeFile(phase5SummaryPath, JSON.stringify(summary, null, 2));
  await fs.writeFile(finalReportPath, report);

  console.log("PHASE_5_EXECUTION_COVERAGE_RESULTS");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved summary -> ${path.relative(repoRoot, phase5SummaryPath).replaceAll("\\", "/")}`);
  console.log(`Saved report -> ${path.relative(repoRoot, finalReportPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

