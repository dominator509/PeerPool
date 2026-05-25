# AD_HOC_DISCOVERY_REPORT

## Campaign Metadata
- Mode: ad hoc exploratory chaos testing (deterministic hypotheses, scripted execution)
- Date: May 25, 2026 (America/Los_Angeles)
- Core target: `artifacts/api-server` runtime surfaces
- Application code modifications: none

## Executed Artifacts
- Target map: [qa/CHAOS_TARGET_MAP.md](./qa/CHAOS_TARGET_MAP.md)
- Phase 2 script: [scripts/src/adhoc/phase2-data-mutation.ts](./scripts/src/adhoc/phase2-data-mutation.ts)
- Phase 3 script: [scripts/src/adhoc/phase3-concurrency-abuse.ts](./scripts/src/adhoc/phase3-concurrency-abuse.ts)
- Phase 4 script: [scripts/src/adhoc/phase4-persona-derailment.ts](./scripts/src/adhoc/phase4-persona-derailment.ts)
- Logs:
  - [qa/logs/phase2-data-mutation-log.json](./qa/logs/phase2-data-mutation-log.json)
  - [qa/logs/phase3-concurrency-log.json](./qa/logs/phase3-concurrency-log.json)
  - [qa/logs/phase4-persona-derailment-log.json](./qa/logs/phase4-persona-derailment-log.json)

## Confirmed Disruptions

### D1: Oversized proof payload is processed instead of rejected
- Vector: malformed payload injection (`settlement-verify-huge-proof-array`)
- Repro:
  1. Run `corepack pnpm --filter @workspace/scripts run test:adhoc:phase2`
  2. Inspect phase-2 log entry `settlement-verify-huge-proof-array`
- Observed:
  - Request with `proof` length 5000 returns `200` with `{ valid: false }` rather than explicit size/shape rejection.
- Risk:
  - Resource amplification surface on `POST /api/escrows/:id/settlement/verify`.
  - Can be used for CPU/memory pressure while still receiving success semantics.

### D2: `admin/sync` returns success while indexer status reports backend failure
- Vector: concurrency abuse with DB-unreachable environment
- Repro:
  1. Run `corepack pnpm --filter @workspace/scripts run test:adhoc:phase3`
  2. Check `syncStorm` and `indexerStatusBodySnippet` fields in phase-3 log
- Observed:
  - `POST /api/admin/sync` returned `200` for all 30 concurrent requests.
  - `GET /api/admin/indexer` simultaneously includes `lastError` with failed DB query details.
- Risk:
  - API success semantics can mask failed sync execution and mislead operators/automation.

### D3: Out-of-sequence workflow violations collapse to generic 500s
- Vector: persona-based derailment (skip prerequisites, invoke terminal steps first)
- Repro:
  1. Run `corepack pnpm --filter @workspace/scripts run test:adhoc:phase4`
  2. Inspect phase-4 outcomes:
     - `resolve-dispute-before-create`
     - `escalate-dispute-before-create`
     - `submit-claim-before-claim-create`
     - `settlement-before-escrow-create`
- Observed:
  - These paths returned `500` JSON errors in this degraded scenario.
- Risk:
  - Poorly differentiated failure signaling under dependency stress makes triage difficult and can hide true state-transition faults.

## Graceful Behaviors Confirmed During Chaos
- No server crash observed across all phases (`serverExitedUnexpectedly: false`).
- No stack traces leaked in response bodies for mutation cases.
- Token reuse after logout correctly returns `401 Invalid or expired session`.
- Session storm primarily throttled via `429`, with some `200`, and no observed `5xx` for that endpoint.

## Reproduction Commands
- Phase 2: `corepack pnpm --filter @workspace/scripts run test:adhoc:phase2`
- Phase 3: `corepack pnpm --filter @workspace/scripts run test:adhoc:phase3`
- Phase 4: `corepack pnpm --filter @workspace/scripts run test:adhoc:phase4`

## Triage Summary
- High concern:
  - D1 oversized proof acceptance
  - D2 sync success/error semantic mismatch
- Medium concern:
  - D3 generic 500 behavior under out-of-order operations in degraded dependency state
