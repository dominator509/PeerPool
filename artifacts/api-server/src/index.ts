import app from "./app";
import { logger } from "./lib/logger";
import { stopIndexerSchedule } from "./lib/indexer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "Shutting down server");
  stopIndexerSchedule();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server shutdown");
      process.exit(1);
    }

    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
