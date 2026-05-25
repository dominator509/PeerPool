# FUNCTIONAL_COVERAGE_REPORT

## Execution Date
- May 25, 2026 (America/Los_Angeles)

## Behavioral Baseline
- Contract source: [qa/BEHAVIORAL_CONTRACT_MAP.md](./qa/BEHAVIORAL_CONTRACT_MAP.md)

## Test Inventory Added
- Unit:
  - `scripts/src/tests/unit/auth.test.ts`
  - `scripts/src/tests/unit/merkle.test.ts`
  - `scripts/src/tests/unit/indexer-id.test.ts`
- Integration:
  - `scripts/src/tests/integration/api-boundaries.test.ts`
- E2E + Concurrency:
  - `scripts/src/tests/e2e/concurrency-e2e.test.ts`

## Commands Executed
- `corepack pnpm --filter @workspace/scripts run test:unit`
- `corepack pnpm --filter @workspace/scripts run test:integration`
- `corepack pnpm --filter @workspace/scripts run test:e2e`

## Results Summary
- Unit: `13 passed, 0 failed`
- Integration: `5 passed, 0 failed`
- E2E/Concurrency: `4 passed, 0 failed`
- Total: `22 passed, 0 failed`

## Covered Workflows
- Auth state lifecycle:
  - nonce generation, retrieval, expiration, and one-time consumption.
  - session creation, expiration, invalidation, middleware enforcement.
  - end-to-end nonce/signature verification/session/logout flow via HTTP.
- Settlement/Merkle logic:
  - deterministic leaf hashing and tree root generation.
  - proof verification success/failure paths.
  - malformed/empty input edge cases.
- Indexer replay safety primitive:
  - deterministic event activity ID generation and fallback hashing behavior.
- API boundary and serialization behavior:
  - health contract shape.
  - deterministic 400/401 validation and auth errors.
  - deterministic JSON 500 degradation when DB is unreachable.
- Concurrency behavior:
  - parallel auth session checks under route throttling.
  - contention on nonce consumption (exactly one successful consume).
  - concurrent Merkle verification at scale.

## Existing Application Findings (No App Code Changes Applied Here)
- Observed behavior under high throughput on `/api/auth/session`:
  - mixture of `200` and `429` responses due auth route rate limiting.
  - no observed `401` drift or `5xx` instability under concurrent load.
  - logged as expected behavior from current limiter policy in `app.ts`.

## Determinism & Mocking Notes
- External DB dependency isolated by using unreachable `DATABASE_URL` in boundary tests to force deterministic error paths.
- External chain/AI boundaries were exercised only through guarded failure/auth checks to avoid non-deterministic network calls.
- Crypto/signature operations use fixed private keys and reproducible payloads.

## Coverage Gaps / Next Hardening Targets
- No full write-path E2E with an ephemeral real Postgres fixture in this suite.
- No explicit AI-route success-path test with mocked Anthropic client.
- No explicit chain/indexer live-RPC integration test with mocked viem transport.
- No contract-level event replay simulation against a deterministic fake chain client.

## Phase Completion
- Phase 1: Behavioral topology mapped and committed.
- Phase 2: Unit/component verification implemented, executed, and committed.
- Phase 3: Integration/boundary validation implemented, executed, and committed.
- Phase 4: Concurrency and E2E workflow validation implemented, executed, and committed.
- Phase 5: Full-suite verification and reporting completed.
