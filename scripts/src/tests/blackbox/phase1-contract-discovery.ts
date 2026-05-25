import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

interface OperationMapEntry {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  requestSchema: string | null;
  responses: Array<{ status: string; schema: string | null }>;
  authorization: string;
}

interface ContractMapEntry {
  contract: string;
  abiFile: string;
  externalFunctionCount: number;
  readFunctionCount: number;
  writeFunctionCount: number;
  eventCount: number;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const openApiPath = path.join(repoRoot, "lib", "api-spec", "openapi.yaml");
const outputPath = path.join(repoRoot, "qa", "logs", "phase1-external-interface-map.json");
const contractsOutDir = path.join(repoRoot, "contracts", "out");

const keyContracts = [
  "PeerPoolEscrow",
  "ManifestRegistry",
  "FundingPool",
  "VoteModule",
  "DisputeController",
  "KlerosAdapterV1",
  "MerkleClaimDistributor",
  "SettlementEngine",
  "AttestationVerifier",
  "FeeController",
  "BondManager",
];

function methodToAuthRequirement(method: HttpMethod, routePath: string): string {
  if (routePath === "/auth/nonce" || routePath === "/auth/verify") {
    return "No auth required (authentication bootstrap route)";
  }

  if (routePath === "/auth/session" || routePath === "/auth/logout") {
    return "Bearer token required";
  }

  if (routePath.startsWith("/admin/")) {
    return "Bearer token likely required (admin route)";
  }

  if (method !== "GET") {
    return "Bearer token likely required (write route)";
  }

  return "No auth required or optional";
}

function parseResponsesFromMethodBlock(methodBlock: string): Array<{ status: string; schema: string | null }> {
  const responses: Array<{ status: string; schema: string | null }> = [];
  const lines = methodBlock.split(/\r?\n/);
  let inResponses = false;
  let currentStatus: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "responses:") {
      inResponses = true;
      currentStatus = null;
      continue;
    }

    if (!inResponses) {
      continue;
    }

    const statusMatch = line.match(/^\s{8}"(\d{3})":\s*$/);
    if (statusMatch) {
      currentStatus = statusMatch[1];
      responses.push({ status: currentStatus, schema: null });
      continue;
    }

    if (currentStatus && line.includes("$ref:")) {
      const schema = line.match(/\$ref:\s*"#\/components\/schemas\/([^"]+)"/)?.[1] ?? null;
      if (schema) {
        const target = responses.findLast((entry) => entry.status === currentStatus);
        if (target && target.schema === null) {
          target.schema = schema;
        }
      }
    }
  }

  return responses;
}

function parsePathOperations(openApiContent: string): OperationMapEntry[] {
  const operations: OperationMapEntry[] = [];
  const pathMatches = [...openApiContent.matchAll(/^  (\/[^:\n]+):\s*$/gm)];

  for (let pathIndex = 0; pathIndex < pathMatches.length; pathIndex += 1) {
    const currentPathMatch = pathMatches[pathIndex];
    const nextPathMatch = pathMatches[pathIndex + 1];

    const routePath = currentPathMatch[1];
    const blockStart = currentPathMatch.index ?? 0;
    const blockEnd = nextPathMatch?.index ?? openApiContent.length;
    const pathBlock = openApiContent.slice(blockStart, blockEnd);

    const methodMatches = [...pathBlock.matchAll(/^    (get|post|put|patch|delete|options|head):\s*$/gm)];

    for (let methodIndex = 0; methodIndex < methodMatches.length; methodIndex += 1) {
      const currentMethodMatch = methodMatches[methodIndex];
      const nextMethodMatch = methodMatches[methodIndex + 1];

      const methodStart = currentMethodMatch.index ?? 0;
      const methodEnd = nextMethodMatch?.index ?? pathBlock.length;
      const methodBlock = pathBlock.slice(methodStart, methodEnd);

      const method = currentMethodMatch[1].toUpperCase() as HttpMethod;
      const operationId = methodBlock.match(/^\s{6}operationId:\s*(.+)$/m)?.[1]?.trim() ?? "";
      const summary = methodBlock.match(/^\s{6}summary:\s*(.+)$/m)?.[1]?.trim() ?? "";

      const requestSchema =
        methodBlock.match(/requestBody:[\s\S]*?\$ref:\s*"#\/components\/schemas\/([^"]+)"/m)?.[1] ??
        null;

      const responses = parseResponsesFromMethodBlock(methodBlock);

      operations.push({
        operationId,
        method,
        path: `/api${routePath}`,
        summary,
        requestSchema,
        responses,
        authorization: methodToAuthRequirement(method, routePath),
      });
    }
  }

  return operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

async function loadContractAbiMap(): Promise<ContractMapEntry[]> {
  const entries: ContractMapEntry[] = [];

  for (const contractName of keyContracts) {
    const abiFile = path.join(contractsOutDir, `${contractName}.sol`, `${contractName}.json`);
    try {
      const raw = await fs.readFile(abiFile, "utf8");
      const parsed = JSON.parse(raw) as { abi?: Array<Record<string, unknown>> };
      const abiItems = parsed.abi ?? [];
      const functions = abiItems.filter((item) => item.type === "function");
      const reads = functions.filter((item) =>
        ["view", "pure"].includes(String(item.stateMutability ?? "")),
      );
      const writes = functions.filter(
        (item) => !["view", "pure"].includes(String(item.stateMutability ?? "")),
      );
      const events = abiItems.filter((item) => item.type === "event");

      entries.push({
        contract: contractName,
        abiFile: path.relative(repoRoot, abiFile).replaceAll("\\", "/"),
        externalFunctionCount: functions.length,
        readFunctionCount: reads.length,
        writeFunctionCount: writes.length,
        eventCount: events.length,
      });
    } catch {
      // Ignore missing artifacts so discovery still succeeds for partial builds.
    }
  }

  return entries;
}

async function main(): Promise<void> {
  const openApiContent = await fs.readFile(openApiPath, "utf8");
  const operations = parsePathOperations(openApiContent);
  const contracts = await loadContractAbiMap();

  const externalInterfaceMap = {
    generatedAt: new Date().toISOString(),
    sources: {
      openApi: path.relative(repoRoot, openApiPath).replaceAll("\\", "/"),
      contractArtifacts: path.relative(repoRoot, contractsOutDir).replaceAll("\\", "/"),
    },
    api: {
      documentedOperationCount: operations.length,
      operations,
    },
    contracts: {
      discoveredContractCount: contracts.length,
      contracts,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(externalInterfaceMap, null, 2));

  console.log("EXTERNAL_INTERFACE_MAP");
  console.log(JSON.stringify(externalInterfaceMap, null, 2));
  console.log(`Saved map artifact -> ${path.relative(repoRoot, outputPath).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
