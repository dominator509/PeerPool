# Phase 2: IaC and Container Security

## Methodology
Reviewed Infrastructure-as-Code configurations, primarily `docker-compose.yml`, for security misconfigurations such as exposed ports, missing volume constraints, or outdated images.

## Findings
Review of `docker-compose.yml`:
- Uses Postgres `17.3-alpine`.
- Environment variables configured for passwords (`POSTGRES_USER`, `POSTGRES_PASSWORD`).
- Binds to `127.0.0.1:54329`, limiting exposure to the local loopback interface.

Overall, local setup appears restricted appropriately.
