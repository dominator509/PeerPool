# INTERNAL_STRUCTURE_MAP

## Scope
- Targeted module set: `artifacts/api-server/src`
- Method: TypeScript AST traversal with control-flow token counting (`if/loop/switch/catch/&&/||/??`)

## Highest Complexity Functions
1. `indexEscrowContract` - `artifacts/api-server/src/lib/indexer.ts:71` - cyclomatic=22, branches=21, boolOps=8, tryCatch=1
2. `<lambda>` - `artifacts/api-server/src/routes/settlement.ts:134` - cyclomatic=14, branches=13, boolOps=4, tryCatch=1
3. `<lambda>` - `artifacts/api-server/src/routes/ai.ts:10` - cyclomatic=13, branches=12, boolOps=6, tryCatch=1
4. `getChainInfo` - `artifacts/api-server/src/lib/chain.ts:70` - cyclomatic=12, branches=11, boolOps=8, tryCatch=1
5. `<lambda>` - `artifacts/api-server/src/routes/auth.ts:38` - cyclomatic=11, branches=10, boolOps=4, tryCatch=1
6. `<lambda>` - `artifacts/api-server/src/routes/escrows.ts:141` - cyclomatic=10, branches=9, boolOps=1, tryCatch=1
7. `buildIndexerActivityId` - `artifacts/api-server/src/lib/indexer.ts:43` - cyclomatic=9, branches=8, boolOps=4, tryCatch=0
8. `<lambda>` - `artifacts/api-server/src/routes/kleros.ts:20` - cyclomatic=9, branches=8, boolOps=1, tryCatch=1
9. `isDependencyFailure` - `artifacts/api-server/src/lib/errors.ts:1` - cyclomatic=8, branches=7, boolOps=7, tryCatch=0
10. `<lambda>` - `artifacts/api-server/src/routes/votes.ts:15` - cyclomatic=8, branches=7, boolOps=3, tryCatch=1
11. `runIndexer` - `artifacts/api-server/src/lib/indexer.ts:183` - cyclomatic=7, branches=6, boolOps=0, tryCatch=1
12. `<lambda>` - `artifacts/api-server/src/routes/disputes.ts:18` - cyclomatic=7, branches=6, boolOps=1, tryCatch=1
13. `<lambda>` - `artifacts/api-server/src/routes/disputes.ts:66` - cyclomatic=7, branches=6, boolOps=0, tryCatch=1
14. `<lambda>` - `artifacts/api-server/src/routes/escrows.ts:53` - cyclomatic=7, branches=6, boolOps=0, tryCatch=1
15. `<lambda>` - `artifacts/api-server/src/routes/votes.ts:57` - cyclomatic=7, branches=6, boolOps=2, tryCatch=1
16. `<lambda>` - `artifacts/api-server/src/routes/claims.ts:76` - cyclomatic=6, branches=5, boolOps=1, tryCatch=1
17. `<lambda>` - `artifacts/api-server/src/routes/disputes.ts:180` - cyclomatic=6, branches=5, boolOps=1, tryCatch=1
18. `<lambda>` - `artifacts/api-server/src/routes/kleros.ts:142` - cyclomatic=6, branches=5, boolOps=0, tryCatch=1
19. `<lambda>` - `artifacts/api-server/src/routes/settlement.ts:16` - cyclomatic=6, branches=5, boolOps=0, tryCatch=1
20. `<lambda>` - `artifacts/api-server/src/lib/indexer.ts:140` - cyclomatic=5, branches=4, boolOps=1, tryCatch=0

## White-Box Priority Targets
- `artifacts/api-server/src/lib/indexer.ts` (multi-branch async state machine, replay/idempotency branches).
- `artifacts/api-server/src/routes/settlement.ts` (input validation, boundary checks, transaction + catch behavior).
- `artifacts/api-server/src/routes/disputes.ts` and `routes/kleros.ts` (state transitions + degraded dependency handling).
- `artifacts/api-server/src/lib/auth.ts` (in-memory nonce/session TTL and auth middleware branching).
- `artifacts/api-server/src/lib/merkle.ts` (hash/proof branch and error boundaries on malformed numeric payload).
