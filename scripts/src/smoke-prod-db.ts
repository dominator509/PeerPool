import { localDatabaseUrl, runCommand, waitForLocalDatabase } from "./local-db";

await waitForLocalDatabase();
await runCommand(
  "corepack",
  ["pnpm", "--filter", "@workspace/scripts", "run", "smoke:prod"],
  {
    DATABASE_URL: localDatabaseUrl,
    SMOKE_WRITE_DB: "1",
  },
);
