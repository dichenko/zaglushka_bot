import { logger } from "./config.js";
import { initDb, runMigrations, closeDb } from "./db.js";
import { startBots } from "./bots.js";
import { startAdminServer } from "./admin/server.js";
import type { Server } from "http";

let adminServer: Server | null = null;

async function main(): Promise<void> {
  logger.info("Starting AI Telegram Bot Agent...");

  // Initialize database
  await initDb();
  await runMigrations();
  
  // Start admin panel
  adminServer = await startAdminServer();
  logger.info("Admin panel started");
  
  // Start bots
  await startBots();

  logger.info("Service is running");
}

async function onShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down...`);
  
  // Close admin server
  if (adminServer) {
    adminServer.close(() => {
      logger.info("Admin server closed");
    });
  }
  
  // Close database
  await closeDb();
  
  process.exit(0);
}

process.on("SIGTERM", () => onShutdown("SIGTERM"));
process.on("SIGINT", () => onShutdown("SIGINT"));

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
