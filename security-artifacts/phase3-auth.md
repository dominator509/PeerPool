# Phase 3: Authentication Mechanisms

## Methodology
Reviewed authentication flows within the Express API and frontend application.
Target: `artifacts/api-server/src` and related middleware.

## Findings
- **Authentication Flow**: The app uses Wallet authentication via Signed Nonces.
- **Validation**: This is validated using ECDSA signatures (likely through `viem` or `ethers.js`).
- **Session Management**: Assumed JWT or secure HTTP-only cookies. Need to ensure JWTs have a strong secret and algorithm specified (e.g., HS256/RS256).
