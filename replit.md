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
- **Validation**: Zod (v4), drizzle-zod
- **API codegen**: Orval (contract-first: OpenAPI → Zod + React Query)
- **Frontend**: React 19, Vite, Wouter (routing), TailwindCSS v4, shadcn/ui
- **Smart contracts**: Foundry (Solidity 0.8.24)

## Frontend Pages

All pages are wired in `artifacts/peerpool-web/src/App.tsx` via Wouter:

| Route | Component | Description |
|---|---|---|
| `/` | Dashboard | Protocol stats, recent escrows, activity feed |
| `/escrows` | EscrowList | Paginated table with state/chain filters |
| `/escrows/new` | CreateEscrow | Create escrow form with manifest picker |
| `/escrows/:id` | EscrowDetail | Participants, votes, claims, state actions |
| `/manifests` | ManifestList | Outcome manifest cards with IPFS hashes |
| `/manifests/new` | CreateManifest | Register manifest with outcomes/conditions |
| `/disputes` | DisputeList | Dispute table with Kleros escalation status |
| `/disputes/:id` | DisputeDetail | AI verdict, Kleros ID, resolve action |
| `/claims` | Claims | Merkle proof submission per escrow |
| `/activity` | ActivityFeed | Protocol-wide event log |

## API Routes

All mounted at `/api` prefix:

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

## Key Commands

```bash
pnpm run typecheck                              # full typecheck across all packages
pnpm run build                                 # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # regenerate API hooks + Zod from OpenAPI
pnpm --filter @workspace/db run push           # push DB schema (dev only)
```

## Design

- Dark theme: `bg-[#0a0e1a]` base, `bg-[#0d1121]` sidebar, `slate-800/slate-900` surfaces
- Accent: `indigo-600`, state badges color-coded by state type
- Dense data display — no emojis, monospace addresses truncated with copy button
- `html class="dark"` — CSS variables wired for dark mode

## Smart Contracts (Foundry)

Located in `contracts/` — NOT a pnpm workspace package. Requires:
```bash
cd contracts && forge install  # installs OZ and other deps via git submodules
forge build                    # compile all contracts
forge test                     # run test suite
```

Key contracts: `PeerPoolEscrow`, `ManifestRegistry`, `FundingPool`, `VoteModule`, `DisputeController`, `KlerosAdapterV1`, `MerkleClaimDistributor`, `SettlementEngine`, `AttestationVerifier`, `FeeController`, `BondManager`.

## Notes

- `lib/api-zod/src/index.ts` exports only from `./generated/api` (no duplicate type re-exports)
- Mutation hooks (`useCreateClaim`, `useSubmitClaim`, `useResolveDispute`) take only options — pass `id`/`claimId` in the mutation variables object, not as hook arguments
- The shared proxy routes `/api` to the API server and `/` to the Vite frontend — no Vite proxy config needed
- `fundedAmount` in escrow schema is `string | undefined` — always coalesce with `?? "0"` before passing to `formatAmount`
