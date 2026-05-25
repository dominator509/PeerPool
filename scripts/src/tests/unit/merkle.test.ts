import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeaf,
  buildSettlementTree,
  verifyProof,
} from "../../../../artifacts/api-server/src/lib/merkle.js";

const CLAIMS = [
  {
    claimantAddress: "0x1111111111111111111111111111111111111111",
    amount: "100",
    escrowId: "escrow-a",
  },
  {
    claimantAddress: "0x2222222222222222222222222222222222222222",
    amount: "200",
    escrowId: "escrow-a",
  },
];

test("buildLeaf is deterministic for identical inputs", () => {
  const a = buildLeaf(CLAIMS[0]);
  const b = buildLeaf(CLAIMS[0]);
  assert.equal(a.toString("hex"), b.toString("hex"));
});

test("buildSettlementTree generates non-empty root and per-claim proofs", () => {
  const tree = buildSettlementTree(CLAIMS);
  assert.match(tree.root, /^0x[0-9a-f]{64}$/);
  assert.equal(tree.leaves.length, CLAIMS.length);
  for (const leaf of tree.leaves) {
    assert.match(leaf.leaf, /^0x[0-9a-f]{64}$/);
    assert.ok(Array.isArray(leaf.proof));
  }
});

test("verifyProof validates good proof and rejects tampered amount", () => {
  const tree = buildSettlementTree(CLAIMS);
  const leaf = tree.leaves[0];
  const valid = verifyProof(
    tree.root,
    leaf.claimantAddress,
    leaf.amount,
    "escrow-a",
    leaf.proof,
  );
  assert.equal(valid, true);

  const invalid = verifyProof(
    tree.root,
    leaf.claimantAddress,
    "999",
    "escrow-a",
    leaf.proof,
  );
  assert.equal(invalid, false);
});

test("buildSettlementTree rejects empty claim sets", () => {
  assert.throws(() => buildSettlementTree([]), /Cannot build Merkle tree from empty claims list/);
});

test("buildLeaf rejects malformed numeric amount", () => {
  assert.throws(
    () =>
      buildLeaf({
        claimantAddress: "0x1111111111111111111111111111111111111111",
        amount: "not-a-number",
        escrowId: "escrow-a",
      }),
    /Cannot convert not-a-number to a BigInt/,
  );
});
