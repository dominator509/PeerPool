# CHAOS_TARGET_MAP

## 1) Auth Nonce/Session In-Memory State (`lib/auth.ts`, `routes/auth.ts`)
- Why vulnerable:
  - volatile in-memory maps with TTL and single-use semantics.
  - highly concurrent access surface (`/auth/nonce`, `/auth/verify`, `/auth/session`).
  - guarded by rate limiters that can mask or amplify failure modes.
- Attack vectors:
  - replay and race on nonce consumption.
  - malformed signature/method/issuedAt combinations.
  - stale token reuse during logout/session checks under parallel load.

## 2) Settlement/Merkle Pipeline (`lib/merkle.ts`, `routes/settlement.ts`)
- Why vulnerable:
  - transforms untrusted payload-like values into BigInt/hash operations.
  - high cardinality proofs can create memory pressure.
  - verification endpoint accepts client-supplied root/proof material.
- Attack vectors:
  - extreme numeric strings, malformed proof arrays, oversized payloads.
  - high-volume proof verification floods.
  - out-of-sequence settlement calls for nonexistent/unprepared escrows.

## 3) Indexer + Scheduler State Machine (`lib/indexer.ts`, `routes/chains.ts`)
- Why vulnerable:
  - asynchronous periodic worker with mutable global status (`running`, counters).
  - on-chain RPC boundary prone to latency/errors.
  - replay handling depends on deterministic event IDs and DB constraints.
- Attack vectors:
  - concurrent `/admin/sync` storms.
  - repeated sync under unreachable DB/RPC to force error-state churn.
  - scheduler overlap and status drift checks.

## 4) DB-Backed State Transitions Across Routes
- Why vulnerable:
  - many endpoints mutate shared entities (`escrows`, `claims`, `disputes`, `activity`).
  - workflow correctness depends on route ordering rather than centralized state machine enforcement.
- Attack vectors:
  - step skipping (resolve/escalate before create, submit before claim exists).
  - duplicate submissions and conflicting transitions under concurrency.
  - malformed but syntactically valid payload classes near zod boundaries.

## 5) External Service Boundaries (Chain RPC + Anthropic AI)
- Why vulnerable:
  - non-deterministic remote dependencies.
  - asynchronous failures can leak degraded states if not handled uniformly.
- Attack vectors:
  - force unreachable network env and call AI/chain routes.
  - timeout-like behavior through repeated parallel calls.
  - verify graceful JSON error responses (no crashes, no stack traces in payload).
