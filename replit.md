# PeerPool — Developer Interface

## Overview

Privacy-conscious decentralized multi-party escrow and dispute-resolution protocol on EVM chains. This is a production-oriented monorepo with:

- **Smart Contracts** — full Foundry workspace (`contracts/`) with interfaces, core contracts, voting, dispute, settlement, and attestation modules
- **API Server** — Express 5 REST API backed by PostgreSQL
- **Web Interface** — React/Vite developer/admin UI wired to the API via generated hooks

## Architecture

```
artifacts/
  api-server/       Express 5 API (port from $PORT, routed at /api)
  peerpool-web/     React + Vite frontend (routed at /)
  mockup-sandbox/   Component Preview Server (canvas design use only)
contracts/          Foundry workspace (NOT a pnpm package)
lib/
  api-spec/         OpenAPI spec (source of truth for codegen)
  api-zod/          Generated Zod schemas (from Orval)
  api-client-react/ Generated React Query hooks (from Orval)
  db/               Drizzle ORM schema + migrations
scripts/            Utility scripts
```

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (v4 via `zod/v4` import), drizzle-zod
- **API codegen**: Orval (contract-first: OpenAPI → Zod + React Query)
- **Frontend**: React 19, Vite, Wouter (routing), TailwindCSS v4, shadcn/ui
- **Smart contracts**: Foundry v1.7.0 (Solidity 0.8.24) — forge binary at `~/.foundry/bin/forge`
- **AI**: Anthropic claude-sonnet via Replit AI integrations proxy
- **On-chain**: viem multi-chain provider (ethereum, arbitrum, optimism, polygon, base, sepolia, arbitrum-sepolia)

## Completed Roadmap Items

| Task | Feature | Status |
|------|---------|--------|
| T001 | AI Dispute Review — POST /api/disputes/:id/ai-review → Anthropic verdict | ✅ |
| T002 | Merkle Tree Generation — POST /api/escrows/:id/settlement with proofs | ✅ |
| T003 | On-chain Integration — viem, indexer polling, chain status endpoints | ✅ |
| T004 | Foundry Compilation — forge installed, all 75 contracts compile clean | ✅ |
| T005 | Kleros Adapter — escalate + kleros-status endpoints, frontend panel | ✅ |
| T006 | Auth / Access Control — EIP-712 nonce/verify middleware, wallet connect UI | ✅ |

## Frontend Pages

All pages are wired in `artifacts/peerpool-web/src/App.tsx` via Wouter:

| Route | Component | Description |
|---|---|---|
| `/` | Dashboard | Protocol stats, chain status, sync button, recent escrows, activity feed |
| `/escrows` | EscrowList | Paginated table with state/chain filters |
| `/escrows/new` | CreateEscrow | Create escrow form with manifest picker |
| `/escrows/:id` | EscrowDetail | Participants, votes, claims, state actions |
| `/manifests` | ManifestList | Outcome manifest cards with IPFS hashes |
| `/manifests/new` | CreateManifest | Register manifest with outcomes/conditions |
| `/disputes` | DisputeList | Dispute table with Kleros escalation status |
| `/disputes/:id` | DisputeDetail | AI verdict panel, Kleros escalation panel, resolve action |
| `/claims` | Claims | Merkle proof submission per escrow |
| `/activity` | ActivityFeed | Protocol-wide event log |

## API Routes

All mounted at `/api` prefix:

### Core
- `GET /api/healthz` — health check
- `GET /api/stats` — protocol-wide statistics
- `GET/POST /api/escrows` — list / create escrows
- `GET /api/escrows/:id` — escrow detail
- `GET /api/escrows/:id/participants` — participant list
- `GET /api/escrows/:id/votes` — vote list + tally
- `GET/POST /api/escrows/:id/claims` — claims
- `POST /api/escrows/:id/claims/:claimId/submit` — submit Merkle proof
- `GET /api/disputes` — dispute list
- `GET /api/disputes/:id` — dispute detail
- `POST /api/disputes/:id/resolve` — resolve dispute
- `GET /api/manifests` — manifest list
- `POST /api/manifests` — register manifest
- `GET /api/activity` — activity feed
- `GET /api/escrows/summary` — escrow state breakdown
- `GET /api/disputes/summary` — dispute state breakdown

### T001: AI Dispute Review
- `POST /api/disputes/:id/ai-review` — Anthropic-powered verdict summary

### T002: Merkle Settlement
- `POST /api/escrows/:id/settlement` — compute Merkle root + per-claimant proofs
- `GET /api/escrows/:id/settlement/verify` — verify a proof against stored root

### T003: On-chain / Indexer
- `GET /api/chains` — supported chains + RPC status
- `GET /api/admin/indexer` — indexer status (last block, running flag)
- `POST /api/admin/sync` — trigger manual index run

### T005: Kleros
- `POST /api/disputes/:id/escalate` — escalate to Kleros arbitration
- `GET /api/disputes/:id/kleros-status` — poll Kleros dispute status

### T006: Auth
- `GET /api/auth/nonce` — get EIP-712 nonce for wallet address
- `POST /api/auth/verify` — verify EIP-712 signature → session
- `GET /api/auth/session` — get current session
- `POST /api/auth/logout` — clear session

## Key Commands

```bash
pnpm run typecheck                              # full typecheck across all packages
pnpm run build                                 # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # regenerate API hooks + Zod from OpenAPI
pnpm --filter @workspace/db run push           # push DB schema (dev only)

# Foundry (forge binary at ~/.foundry/bin/forge)
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge build                    # compile all 75 contracts
cd contracts && forge test                     # run test suite
cd contracts && forge install <dep>            # add git submodule dependency
```

## Design

- Dark theme: `bg-[#0a0e1a]` base, `bg-[#0d1121]` sidebar, `slate-800/slate-900` surfaces
- Accent: `indigo-600`, state badges color-coded by state type
- Dense data display — no emojis, monospace addresses truncated with copy button
- `html class="dark"` — CSS variables wired for dark mode

## Smart Contracts (Foundry)

Located in `contracts/` — NOT a pnpm workspace package.

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge build    # compiles all 75 files — warnings only, no errors
cd contracts && forge test     # run test suite
```

Key contracts: `PeerPoolEscrow`, `ManifestRegistry`, `FundingPool`, `VoteModule`, `DisputeController`, `KlerosAdapterV1`, `MerkleClaimDistributor`, `SettlementEngine`, `AttestationVerifier`, `FeeController`, `BondManager`.

Git submodule deps in `contracts/lib/`: `forge-std`, `openzeppelin-contracts`, `openzeppelin-contracts-upgradeable`.

## Server Libraries

- `artifacts/api-server/src/lib/chain.ts` — viem multi-chain provider factory
- `artifacts/api-server/src/lib/merkle.ts` — merkletreejs Merkle root + proof builder
- `artifacts/api-server/src/lib/indexer.ts` — event polling service (configurable interval)
- `artifacts/api-server/src/lib/auth.ts` — EIP-712 nonce + session management
- `artifacts/api-server/src/lib/abis.ts` — inline PeerPoolEscrow / PeerPoolDispute ABIs

## Frontend Libraries

- `artifacts/peerpool-web/src/lib/wallet.ts` — EIP-712 wallet connect using window.ethereum
- `artifacts/peerpool-web/src/lib/zodResolver.ts` — custom Zod v4-compatible form resolver (avoids @hookform/resolvers version mismatch)

## Notes

- `lib/api-zod/src/index.ts` exports only from `./generated/api` (no duplicate type re-exports)
- Mutation hooks take only options — pass `id`/`claimId` in the mutation variables object
- The shared proxy routes `/api` to the API server and `/` to the Vite frontend — no Vite proxy config needed
- `fundedAmount` in escrow schema is `string | undefined` — always coalesce with `?? "0"` before passing to `formatAmount`
- Zod forms use `makeZodResolver` from `@/lib/zodResolver` instead of `@hookform/resolvers/zod` — avoids v3/v4 type incompatibility
- Kleros adapter gracefully falls back to simulated escalation if `KLEROS_ADAPTER_<CHAIN>` env vars are not set
- AI integration uses `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` (Replit-provisioned)
