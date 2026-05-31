import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config, logger } from "./config.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initDb(): Promise<void> {
  const maxRetries = 10;
  const retryDelayMs = 3000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      logger.info("Connected to PostgreSQL");
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        logger.fatal({ err }, "Failed to connect to PostgreSQL after max retries");
        process.exit(1);
      }
      logger.warn(
        { err, attempt, maxRetries },
        `DB connection failed, retrying in ${retryDelayMs / 1000}s...`
      );
      await wait(retryDelayMs);
    }
  }
}

export async function runMigrations(): Promise<void> {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const migrationsDir = join(__dirname, "migrations");

  const sql = readFileSync(join(migrationsDir, "001_init.sql"), "utf-8");

  try {
    await pool.query(sql);
    logger.info("Migration 001_init applied");
  } catch (err) {
    logger.fatal({ err }, "Failed to apply migration");
    process.exit(1);
  }
}

export async function upsertBotContact(params: {
  tgId: number;
  botLink: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bot_contacts (tg_id, bot_link)
     VALUES ($1, $2)
     ON CONFLICT (tg_id, bot_link)
     DO UPDATE SET updated_at = now()`,
    [params.tgId, params.botLink]
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info("Database pool closed");
}
