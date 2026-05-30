# Phase 2: Static Application Security Testing (SAST)

## Methodology
Performed Static Application Security Testing across the Express API and React frontend codebases, focusing on:
- Hardcoded sensitive values
- Unsafe use of raw SQL or eval
- Potential injection vulnerabilities

## Findings
- **Data Flow**: The Drizzle ORM is used consistently (`lib/db`), mitigating the risk of raw SQL injection.
- **Taint Analysis**: User input from API endpoints (`req.body`, `req.query`) is validated through generated Zod schemas (`lib/api-zod`) prior to processing.
- **Frontend**: React handles HTML escaping naturally, mitigating raw XSS unless `dangerouslySetInnerHTML` is used.

Checked for unsafe methods in source files:
```bash
grep -rnEI "eval\(|dangerouslySetInnerHTML" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=security-artifacts --exclude=pnpm-lock.yaml > sast-results.txt || true
```

## Potential Vulnerabilities Detected
```text
./artifacts/mockup-sandbox/src/components/ui/chart.tsx:78:      dangerouslySetInnerHTML={{
./artifacts/peerpool-web/src/components/ui/chart.tsx:79:      dangerouslySetInnerHTML={{
```
