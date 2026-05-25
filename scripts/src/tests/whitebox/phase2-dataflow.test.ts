import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSignMessage,
  consumeNonce,
  createSession,
  generateNonce,
  getNonce,
  getSession,
  invalidateSession,
  requireAuth,
} from "../../../../artifacts/api-server/src/lib/auth.js";
import { buildLeaf } from "../../../../artifacts/api-server/src/lib/merkle.js";
import { isDependencyFailure } from "../../../../artifacts/api-server/src/lib/errors.js";

test("auth nonce state transitions: init -> read -> consume -> gone", () => {
  const address = "0x7777777777777777777777777777777777777777";
  const first = generateNonce(address);
  const read = getNonce(address);
  assert.ok(read);
  assert.equal(read?.nonce, first.nonce);
  assert.equal(read?.issuedAt, first.issuedAt);

  const consumed = consumeNonce(address);
  assert.equal(consumed?.nonce, first.nonce);
  assert.equal(getNonce(address), null);
});

test("requireAuth mutates request with authSession only on valid bearer", () => {
  const token = createSession("0x8888888888888888888888888888888888888888");
  const req = { headers: { authorization: `Bearer ${token}` } } as any;
  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
  };

  let nextCalled = false;
  requireAuth(req, res as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(typeof req.authSession.address, "string");
  assert.equal(req.authSession.address, "0x8888888888888888888888888888888888888888");
});

test("session lifecycle transitions: create -> read -> invalidate -> null", () => {
  const token = createSession("0x9999999999999999999999999999999999999999");
  assert.ok(getSession(token));
  invalidateSession(token);
  assert.equal(getSession(token), null);
});

test("message structure is deterministic for fixed inputs", () => {
  const msg = buildSignMessage("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "nonce-x", "2026-01-01T00:00:00.000Z");
  assert.equal(
    msg,
    [
      "Sign in to PeerPool Protocol",
      "",
      "Address: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Nonce: nonce-x",
      "Issued At: 2026-01-01T00:00:00.000Z",
      "",
      "This request will not trigger a blockchain transaction or cost any gas fees.",
    ].join("\n"),
  );
});

test("buildLeaf supports extreme-but-valid numeric string", () => {
  const leaf = buildLeaf({
    claimantAddress: "0x1111111111111111111111111111111111111111",
    amount: "9".repeat(60),
    escrowId: "escrow-extreme",
  });
  assert.equal(leaf.length, 32);
});

test("buildIndexerActivityId data flow prefers tx/log index and falls back to hash", async () => {
  process.env.DATABASE_URL ??= "postgres://peerpool:peerpool@127.0.0.1:1/peerpool";
  const { buildIndexerActivityId } = await import(
    "../../../../artifacts/api-server/src/lib/indexer.js"
  );
  const { pool } = await import("../../../../lib/db/src/index.js");
  const txKey = buildIndexerActivityId({
    chain: "ethereum",
    contractAddress: "0x0000000000000000000000000000000000000001",
    escrowId: "escrow-1",
    log: { transactionHash: "0xabc", logIndex: 9n, eventName: "EscrowFunded" },
  });
  assert.equal(txKey, "idx:ethereum:0xabc:9");

  const fallback = buildIndexerActivityId({
    chain: "ethereum",
    contractAddress: "0x0000000000000000000000000000000000000001",
    escrowId: "escrow-1",
    log: { eventName: "EscrowFunded", blockHash: "0x123", blockNumber: 99n },
  });
  assert.match(fallback, /^idx:[0-9a-f]{64}$/);
  await pool.end();
});

test("dependency classifier flags expected transport/db signatures", () => {
  assert.equal(isDependencyFailure("Error: Failed query: select * from x"), true);
  assert.equal(isDependencyFailure("connect ECONNREFUSED 127.0.0.1"), true);
  assert.equal(isDependencyFailure("network ETIMEDOUT"), true);
  assert.equal(isDependencyFailure("generic application error"), false);
});
