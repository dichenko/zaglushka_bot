import { logger } from "./config.js";
import { initDb, runMigrations, closeDb } from "./db.js";
import { startBots } from "./bots.js";

async function main(): Promise<void> {
  logger.info("Starting tg-bots-placeholder...");

  await initDb();
  await runMigrations();
  await startBots();

  logger.info("Service is running");
}

function onShutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down...`);
  closeDb()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGTERM", () => onShutdown("SIGTERM"));
process.on("SIGINT", () => onShutdown("SIGINT"));

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
