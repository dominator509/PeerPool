# BLACK BOX CONTRACT REPORT

Generated: 2026-05-26T00:15:27.983Z

## Coverage Summary

- Documented OpenAPI operations: 37
- Attempted operations (observed via black-box suite): 19
- Successfully tested operations: 19
- Attempted interface coverage: 51.35%
- Successful interface coverage: 51.35%

## Phase Execution Totals

- Phase 2 (Equivalence/Boundary): 12/12 passed, 0 failed
- Phase 3 (State Transition): 14/14 passed, 0 failed
- Phase 4 (Negative/Leakage): 8/8 passed, 0 failed

## Unhandled External Exceptions

- None observed (no null-status executions and no 5xx outcomes in captured suite runs).

## Leakage Assertion

- Critical leakage findings: 0
- Observation: responses did not expose stack traces, DB schema SQL text, or framework version details in the Phase 4 suite.

## Deviations From Expected External Contract

- None.

## Untested Documented Operations

- GET /api/activity
- GET /api/admin/indexer
- POST /api/auth/logout
- GET /api/chains
- GET /api/chains/{name}
- GET /api/disputes
- POST /api/disputes
- GET /api/disputes/{id}
- POST /api/disputes/{id}/ai-review
- POST /api/disputes/{id}/escalate
- GET /api/disputes/{id}/kleros-status
- GET /api/disputes/summary
- PATCH /api/escrows/{id}
- GET /api/escrows/summary
- GET /api/healthz
- GET /api/manifests
- GET /api/manifests/{id}
- GET /api/stats

## Attempted But Not Successfully Verified Operations

- None.
