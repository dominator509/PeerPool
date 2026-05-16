import { localDatabaseUrl, runCommand, waitForLocalDatabase } from "./local-db";

await waitForLocalDatabase();
await runCommand(
  "corepack",
  ["pnpm", "--filter", "@workspace/db", "run", "push"],
  { DATABASE_URL: localDatabaseUrl },
);
