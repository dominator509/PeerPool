# Phase 6: Compliance Frameworks

## Methodology
Analyzed system architecture against generic ISO 27001 and SOC 2 requirements.

## Findings
- **Access Control**: Role separation between users, indexers, and admins is defined.
- **Data Protection**: Sensitive credentials (private keys) are not hardcoded. Database backups and access controls are infrastructure-dependent but assumed secure.
- **Audit Logging**: Application layer audit logs are essential for SOC 2.
