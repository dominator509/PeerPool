# Phase 3: Authorization (RBAC/ABAC)

## Methodology
Reviewed API endpoints for Role-Based Access Control (RBAC) and Privilege Escalation.

## Findings
- **Admin Routes**: Endpoints like `POST /api/admin/sync` and `GET /api/admin/indexer` exist.
- **Validation**: These must require a specific admin role or flag in the validated JWT/session to prevent unauthorized access.
- **Escrow Operations**: Write operations require an authenticated bearer session mapped to specific wallet addresses participating in the escrow.
