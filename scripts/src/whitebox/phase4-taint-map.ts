import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const routesDir = path.join(root, "artifacts", "api-server", "src", "routes");
const out = path.join(root, "qa", "logs", "phase4-taint-analysis.json");

type Finding = {
  file: string;
  source: string;
  sink: string;
  note: string;
};

async function main(): Promise<void> {
  const files = (await fs.readdir(routesDir))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(routesDir, f));
  const findings: Finding[] = [];

  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const src = await fs.readFile(file, "utf8");
    const sourceTokens = ["req.body", "req.params", "req.query"];
    const sinkTokens = ["db.insert(", "db.update(", "db.transaction(", "getAnthropicClient()", "client.readContract("];
    for (const source of sourceTokens) {
      if (!src.includes(source)) continue;
      for (const sink of sinkTokens) {
        if (!src.includes(sink)) continue;
        findings.push({
          file: rel,
          source,
          sink,
          note: "Potential taint path requiring validation/error-boundary tests",
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    findingCount: findings.length,
    findings,
  };
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("PHASE4_TAINT_ANALYSIS");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
