# PeerPool

[![CI](https://github.com/dominator509/PeerPool/actions/workflows/ci.yml/badge.svg)](https://github.com/dominator509/PeerPool/actions/workflows/ci.yml)

PeerPool is a decentralized multi-party escrow and dispute-resolution system for EVM chains. It is built to make programmable escrow usable by people who should not need to write Solidity, JSON manifests, or raw token-unit math just to run a shared payout.

The current app includes a guided manifest builder, escrow creation flow, participant roster management, dispute workflows, Merkle settlement generation, and a production-oriented API/frontend deployment path.

## What This Repo Contains

```text
artifacts/
  api-server/       Express API served under /api
  peerpool-web/     React + Vite app served at /
  mockup-sandbox/   UI mockup sandbox
contracts/          Foundry smart-contract workspace
lib/
  api-spec/         OpenAPI source of truth
  api-zod/          Generated Zod schemas
  api-client-react/ Generated React Query API hooks
  db/               Drizzle schema and database connection
  protocol-config/  Shared chain/token/protocol metadata
scripts/            Local DB and production smoke helpers
```

## Core Features

- Guided payout manifest builder for contests, milestones, approvals, and custom escrow rules.
- Escrow creation with network selection, USDC defaults, custom ERC-20 support, and human amount conversion.
- Participant roster entry with multi-address paste support.
- Wallet authentication using signed nonces.
- PostgreSQL-backed API with Drizzle ORM.
- Merkle settlement root and proof generation.
- On-chain chain metadata and indexer support via viem.
- Smart contracts in Foundry, including escrow, manifest, voting, dispute, and settlement modules.
- Integrated production server that serves both `/api` and the built frontend.

## Requirements

- Node.js 24
- Corepack with pnpm 10.33.2
- Docker Desktop for the local PostgreSQL service
- Git
- Foundry for contract work
- RTK for agent shell commands in this repo

This repo has an `AGENTS.md` file that loads:

```md
@C:\Users\domin\.codex\RTK.md
```

Agent shell commands should be prefixed with `rtk`.

## Quick Start

Install dependencies:

```powershell
corepack pnpm install
```

Start the local database:

```powershell
corepack pnpm run db:start
```

Push the local schema:

```powershell
corepack pnpm run db:push:local
```

Build everything:

```powershell
corepack pnpm run build
```

Run the production smoke test with the local database:

```powershell
corepack pnpm run smoke:prod:db
```

## Environment

Copy `.env.example` when setting up a local environment:

```env
DATABASE_URL=postgres://peerpool:peerpool@127.0.0.1:54329/peerpool

AI_INTEGRATIONS_ANTHROPIC_BASE_URL=
AI_INTEGRATIONS_ANTHROPIC_API_KEY=
```

The app boots without Anthropic configuration. AI review routes return a configuration error until those values are provided.

## Useful Scripts

```powershell
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm run db:start
corepack pnpm run db:stop
corepack pnpm run db:push:local
corepack pnpm run smoke:prod
corepack pnpm run smoke:prod:db
```

## Local Production Server

After `corepack pnpm run build`, the API server can serve the frontend bundle by setting:

```powershell
$env:DATABASE_URL = "postgres://peerpool:peerpool@127.0.0.1:54329/peerpool"
$env:PORT = "4173"
$env:PEERPOOL_WEB_DIST = "C:\dev\Secure-Escrow-Hub\artifacts\peerpool-web\dist\public"
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Then open:

```text
http://localhost:4173
```

## API Overview

Important route groups:

- `GET /api/healthz`
- `GET/POST /api/escrows`
- `GET /api/escrows/:id`
- `GET/POST /api/escrows/:id/participants`
- `GET/POST /api/escrows/:id/claims`
- `POST /api/escrows/:id/settlement`
- `GET/POST /api/manifests`
- `GET /api/chains`
- `GET /api/admin/indexer`
- `POST /api/admin/sync`
- `POST /api/disputes/:id/ai-review`
- `POST /api/disputes/:id/escalate`

The OpenAPI source lives in `lib/api-spec/openapi.yaml`.

## Smart Contracts

Contracts live in `contracts/` and are intentionally not a pnpm workspace package.

Common commands:

```powershell
cd contracts
forge build
forge test
```

Key contract areas:

- `PeerPoolEscrow`
- `ManifestRegistry`
- `FundingPool`
- `VoteModule`
- `DisputeController`
- `KlerosAdapterV1`
- `MerkleClaimDistributor`
- `SettlementEngine`
- `AttestationVerifier`
- `FeeController`
- `BondManager`

## Architecture Notes

- `lib/protocol-config` is the shared source of truth for supported chains, RPC env var names, default token metadata, address validation, and amount conversion.
- `lib/api-spec` drives generated Zod schemas and React Query hooks.
- `artifacts/api-server/src/app.ts` serves `/api` first, then the built frontend as an SPA.
- Write routes require wallet-authenticated bearer sessions.
- The local database is PostgreSQL 17 via Docker Compose on port `54329`.

## Current Verification Baseline

GitHub Actions runs the TypeScript app build, local PostgreSQL schema push, production smoke test, and Foundry contract build/tests on pushes to `main` and pull requests.

These checks have been used as the main local confidence suite:

```powershell
corepack pnpm run build
corepack pnpm run smoke:prod:db
```

The smoke test starts the built API server, checks API health and SPA serving, exercises auth nonce/signature verification, and can optionally write through to the local database.
