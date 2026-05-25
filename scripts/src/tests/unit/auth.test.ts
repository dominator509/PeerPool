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

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";

test("generateNonce/getNonce/consumeNonce is one-time and case-insensitive", () => {
  const entry = generateNonce(ADDRESS_A.toUpperCase());
  assert.equal(typeof entry.nonce, "string");
  assert.ok(entry.nonce.length > 0);

  const fetched = getNonce(ADDRESS_A.toLowerCase());
  assert.deepEqual(fetched, entry);

  const consumed = consumeNonce(ADDRESS_A.toLowerCase());
  assert.deepEqual(consumed, entry);
  assert.equal(getNonce(ADDRESS_A), null);
});

test("getNonce removes expired entries", () => {
  const realNow = Date.now;
  try {
    const t0 = 1_700_000_000_000;
    Date.now = () => t0;
    generateNonce(ADDRESS_B);

    Date.now = () => t0 + 5 * 60 * 1000 + 1;
    assert.equal(getNonce(ADDRESS_B), null);
  } finally {
    Date.now = realNow;
  }
});

test("buildSignMessage contains protocol safety text and fields", () => {
  const message = buildSignMessage(ADDRESS_A, "abc123", "2026-01-01T00:00:00.000Z");
  assert.match(message, /Sign in to PeerPool Protocol/);
  assert.match(message, new RegExp(`Address: ${ADDRESS_A}`));
  assert.match(message, /Nonce: abc123/);
  assert.match(message, /Issued At: 2026-01-01T00:00:00.000Z/);
  assert.match(message, /will not trigger a blockchain transaction/i);
});

test("createSession/getSession/invalidateSession lifecycle", () => {
  const token = createSession(ADDRESS_A.toUpperCase());
  const session = getSession(token);
  assert.ok(session);
  assert.equal(session?.address, ADDRESS_A.toLowerCase());

  invalidateSession(token);
  assert.equal(getSession(token), null);
});

test("getSession expires entries by TTL", () => {
  const realNow = Date.now;
  try {
    const t0 = 1_700_000_000_000;
    Date.now = () => t0;
    const token = createSession(ADDRESS_B);
    assert.ok(getSession(token));

    Date.now = () => t0 + 24 * 60 * 60 * 1000 + 1;
    assert.equal(getSession(token), null);
  } finally {
    Date.now = realNow;
  }
});

test("requireAuth enforces bearer token and valid session", () => {
  const missingReq = { headers: {} } as any;
  const missingRes = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let called = false;
  requireAuth(missingReq, missingRes as any, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(missingRes.statusCode, 401);

  const token = createSession(ADDRESS_A);
  const okReq = { headers: { authorization: `Bearer ${token}` } } as any;
  const okRes = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let okCalled = false;
  requireAuth(okReq, okRes as any, () => {
    okCalled = true;
  });
  assert.equal(okCalled, true);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okReq.authSession.address, ADDRESS_A.toLowerCase());
});
