# BEHAVIORAL_CONTRACT_MAP

## Scope
- Primary target: `artifacts/api-server` runtime behavior.
- Secondary validation targets: `artifacts/api-server/src/lib/{auth,merkle,indexer,chain}.ts`.
- UI and generated API clients are treated as downstream consumers of API contracts.

## Core Workflows

### 1) Authentication Workflow
- Inputs:
  - `GET /api/auth/nonce?address=0x...` with valid EVM address.
  - `POST /api/auth/verify` with `{ address, signature, nonce, method?, issuedAt? }`.
  - `GET /api/auth/session` and `POST /api/auth/logout` with bearer token.
- Stateful components:
  - In-memory `nonces` map keyed by lowercased address.
  - In-memory `activeSessions` map keyed by generated token.
- Expected state mutations:
  - `nonce` generation inserts/replaces nonce entry with TTL.
  - `verify` consumes nonce once and creates one active session token on success.
  - expired nonce/session entries are lazily removed on read.
  - logout invalidates token if present.
- Outputs:
  - 400 for invalid address or malformed verify payload.
  - 401 for invalid/expired nonce/session or failed signature verification.
  - 200 with nonce/session JSON on success.

### 2) Escrow Lifecycle Workflow
- Inputs:
  - `POST /api/manifests` (auth), `POST /api/escrows` (auth), `PATCH /api/escrows/:id` (auth).
  - `POST /api/escrows/:id/participants` (auth), `POST /api/escrows/:id/votes` (auth), `POST /api/disputes` (auth), `POST /api/disputes/:id/resolve` (auth).
- Stateful components:
  - Postgres tables: `manifests`, `escrows`, `participants`, `votes`, `disputes`, `activity`.
- Expected state mutations:
  - create operations insert rows and append typed activity events.
  - participant/vote writes increment aggregate counters on escrow.
  - disputes transition escrow state to `disputed`; resolution marks dispute resolved.
- Outputs:
  - 201 for successful creates.
  - 404 when parent resources do not exist.
  - 400 for schema-invalid payloads.

### 3) Claims + Settlement Workflow
- Inputs:
  - `POST /api/escrows/:id/claims` (auth), `POST /api/escrows/:id/claims/:claimId/submit` (auth).
  - `POST /api/escrows/:id/settlement` (auth).
  - `GET /api/escrows/:id/settlement`.
  - `POST /api/escrows/:id/settlement/verify`.
- Stateful components:
  - `claims` rows (`merkleRoot`, `merkleProof`, `leafHash`, `state`).
  - `escrows.state` transition to `settled`.
  - `activity` includes `escrow_settled` events.
- Expected state mutations:
  - settlement computes deterministic Merkle root/proofs from claim set.
  - settlement persistence is atomic across claims + escrow state + activity event.
- Outputs:
  - 400 when no claims exist or verification payload is malformed.
  - 404 when settlement root is absent.
  - 200 with root/proofs or proof validity response.

### 4) Indexer Workflow
- Inputs:
  - scheduler tick (`startIndexerSchedule`) and `POST /api/admin/sync` (auth).
  - on-chain logs from supported chains/escrow contracts.
- Stateful components:
  - in-memory `status` object (`running`, `lastRun`, `lastError`, counters).
  - DB activity and escrow state updates.
- Expected state mutations:
  - re-entrancy guard prevents concurrent indexer runs.
  - deterministic activity id (`idx:*`) ensures log replay dedupe.
  - only newly inserted activity events advance `eventsProcessed` and trigger state updates.
- Outputs:
  - `GET /api/admin/indexer` returns status snapshot.
  - sync returns `{ ok, syncedContracts, eventsProcessed }`.

### 5) External Boundary Contracts
- Chain RPC boundary:
  - `getChainInfo` and `runIndexer` depend on viem clients (RPC/network unstable).
  - expected graceful degradation: null/partial chain info and warning logs on failures.
- AI boundary:
  - `/api/disputes/:id/ai-review` depends on Anthropic client.
  - expected failure mode: 500 `AI review failed` without process crash.
- Database boundary:
  - all DB-backed routes return JSON error responses on DB failures; no HTML fallthrough for `/api/*`.

## Deterministic Testing Rules Derived From Contract
- Signature verification, chain RPC, and AI calls must be mocked/stubbed.
- DB interactions in integration tests must use deterministic in-memory/fake adapters or controlled local DB fixtures.
- Concurrency tests must validate:
  - nonce/session one-time use and TTL behavior.
  - indexer re-entry skipping and replay dedupe semantics.
  - settlement atomicity invariants under simulated mid-flight failures.
