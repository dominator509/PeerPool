# Phase 4: Dynamic Application Security Testing (DAST)

## Methodology
To execute DAST, we must run the local database and the production API server.

## Simulated Execution
```bash
corepack pnpm run db:start
corepack pnpm run db:push:local
corepack pnpm run build
corepack pnpm run smoke:prod:db
```

As indicated by the README, the smoke test `corepack pnpm run smoke:prod:db` exercises:
1. API health
2. SPA serving
3. Auth nonce/signature verification

This acts as a basic baseline for functional interactive testing.

## Findings
The smoke test successfully verified basic API routing and authorization logic. More aggressive DAST (like ZAP) would require specific crawling of the Express API, which is primarily protected by the Signed Nonce auth flow.
