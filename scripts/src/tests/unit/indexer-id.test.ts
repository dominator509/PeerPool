import test from "node:test";
import assert from "node:assert/strict";

test("buildIndexerActivityId is deterministic and unique by tx/log index", async () => {
  const { buildIndexerActivityId } = await import(
    "../../../../artifacts/api-server/src/lib/indexer-activity-id.js"
  );

  const base = {
    chain: "ethereum",
    contractAddress: "0x0000000000000000000000000000000000000001",
    escrowId: "escrow-id",
  } as const;

  const a = buildIndexerActivityId({
    ...base,
    log: { transactionHash: "0xabc", logIndex: 7n, eventName: "EscrowFunded" },
  });
  const b = buildIndexerActivityId({
    ...base,
    log: { transactionHash: "0xabc", logIndex: 7n, eventName: "EscrowFunded" },
  });
  const c = buildIndexerActivityId({
    ...base,
    log: { transactionHash: "0xabc", logIndex: 8n, eventName: "EscrowFunded" },
  });

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^idx:/);
});

test("buildIndexerActivityId fallback path hashes non-tx identifiers", async () => {
  const { buildIndexerActivityId } = await import(
    "../../../../artifacts/api-server/src/lib/indexer-activity-id.js"
  );

  const id = buildIndexerActivityId({
    chain: "ethereum",
    contractAddress: "0x0000000000000000000000000000000000000001",
    escrowId: "escrow-id",
    log: { eventName: "Settled", blockHash: "0xdef", blockNumber: 42n },
  });

  assert.match(id, /^idx:[0-9a-f]{64}$/);
});
