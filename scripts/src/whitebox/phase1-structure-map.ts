import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type FnMetric = {
  file: string;
  name: string;
  line: number;
  cyclomatic: number;
  branches: number;
  boolOps: number;
  tryCatch: number;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const apiSrc = path.join(root, "artifacts", "api-server", "src");
const outMap = path.join(root, "qa", "INTERNAL_STRUCTURE_MAP.md");
const outJson = path.join(root, "qa", "logs", "phase1-structure-map.json");

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function complexityForNode(node: ts.Node): { cyclomatic: number; branches: number; boolOps: number; tryCatch: number } {
  let branches = 0;
  let boolOps = 0;
  let tryCatch = 0;
  const visit = (n: ts.Node) => {
    if (
      ts.isIfStatement(n) ||
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n) ||
      ts.isConditionalExpression(n) ||
      ts.isCaseClause(n)
    ) {
      branches += 1;
    }
    if (ts.isCatchClause(n)) {
      tryCatch += 1;
      branches += 1;
    }
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      boolOps += 1;
      branches += 1;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return { cyclomatic: 1 + branches, branches, boolOps, tryCatch };
}

function fnName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "<lambda>";
  return "<unknown>";
}

async function main(): Promise<void> {
  const files = await walk(apiSrc);
  const metrics: FnMetric[] = [];

  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        const start = sf.getLineAndCharacterOfPosition(node.getStart());
        const c = complexityForNode(node);
        metrics.push({
          file: path.relative(root, file).replaceAll("\\", "/"),
          name: fnName(node),
          line: start.line + 1,
          cyclomatic: c.cyclomatic,
          branches: c.branches,
          boolOps: c.boolOps,
          tryCatch: c.tryCatch,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const ranked = [...metrics].sort((a, b) => b.cyclomatic - a.cyclomatic);
  const top = ranked.slice(0, 20);

  const report = [
    "# INTERNAL_STRUCTURE_MAP",
    "",
    "## Scope",
    "- Targeted module set: `artifacts/api-server/src`",
    "- Method: TypeScript AST traversal with control-flow token counting (`if/loop/switch/catch/&&/||/??`)",
    "",
    "## Highest Complexity Functions",
    ...top.map(
      (m, i) =>
        `${i + 1}. \`${m.name}\` - \`${m.file}:${m.line}\` - cyclomatic=${m.cyclomatic}, branches=${m.branches}, boolOps=${m.boolOps}, tryCatch=${m.tryCatch}`,
    ),
    "",
    "## White-Box Priority Targets",
    "- `artifacts/api-server/src/lib/indexer.ts` (multi-branch async state machine, replay/idempotency branches).",
    "- `artifacts/api-server/src/routes/settlement.ts` (input validation, boundary checks, transaction + catch behavior).",
    "- `artifacts/api-server/src/routes/disputes.ts` and `routes/kleros.ts` (state transitions + degraded dependency handling).",
    "- `artifacts/api-server/src/lib/auth.ts` (in-memory nonce/session TTL and auth middleware branching).",
    "- `artifacts/api-server/src/lib/merkle.ts` (hash/proof branch and error boundaries on malformed numeric payload).",
  ].join("\n");

  await fs.writeFile(outMap, `${report}\n`, "utf8");
  await fs.writeFile(
    outJson,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), fileCount: files.length, functionCount: metrics.length, top }, null, 2)}\n`,
    "utf8",
  );
  console.log("INTERNAL_STRUCTURE_MAP");
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
