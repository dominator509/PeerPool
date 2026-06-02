# Phase 1: Threat Modeling, Attack Surface Mapping, and STRIDE Analysis

## Architecture Overview
PeerPool is a decentralized multi-party escrow and dispute-resolution system for EVM chains.
Components:
1. **Frontend**: React + Vite (artifacts/peerpool-web)
2. **Backend**: Express API (artifacts/api-server)
3. **Database**: PostgreSQL (lib/db) using Drizzle ORM
4. **Smart Contracts**: Foundry workspace (contracts) with EVM logic
5. **Wallet Authentication**: Signed nonces verification

## Attack Surface Mapping
- **API Endpoints**: `/api/escrows`, `/api/escrows/:id/participants`, `/api/manifests`, etc. Attack vectors: Auth bypass, IDOR, SQL injection, business logic abuse.
- **Smart Contracts**: EVM contracts like `PeerPoolEscrow`, `ManifestRegistry`. Attack vectors: Reentrancy, front-running, access control issues, logic bugs.
- **Frontend App**: Attack vectors: XSS, CSRF, insecure local storage.
- **Database**: Attack vectors: SQL injection via Drizzle, misconfigurations.

## STRIDE Analysis
- **Spoofing**: Attackers could forge signed nonces to spoof wallet identities. Mitigation: strict nonce validation and expiry.
- **Tampering**: Modifying API requests or transaction payloads before hitting the EVM. Mitigation: HTTPS, signature verification, immutable smart contracts.
- **Repudiation**: Escrow participants denying actions. Mitigation: On-chain transactions and local audit logs.
- **Information Disclosure**: Exposing API keys, PII, or sensitive escrow details. Mitigation: Environment variables, RBAC.
- **Denial of Service (DoS)**: Spamming API or failing smart contract execution (gas limit DoS). Mitigation: Rate limiting, careful EVM gas management.
- **Elevation of Privilege**: Normal users accessing admin/indexer routes. Mitigation: Strict RBAC and authentication checks.
