import dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

interface AppConfig {
  databaseUrl: string;
  botTokens: string[];
  autoReplyMessage: string;
  dropPendingUpdates: boolean;
}

function loadConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const botTokensRaw = process.env.BOT_TOKENS;
  const autoReplyMessage = process.env.AUTO_REPLY_MESSAGE;
  const dropPendingUpdates = process.env.DROP_PENDING_UPDATES === "true";

  if (!databaseUrl) {
    logger.fatal("DATABASE_URL is not set");
    process.exit(1);
  }

  if (!botTokensRaw) {
    logger.fatal("BOT_TOKENS is not set");
    process.exit(1);
  }

  if (!autoReplyMessage) {
    logger.fatal("AUTO_REPLY_MESSAGE is not set");
    process.exit(1);
  }

  const botTokens = botTokensRaw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (botTokens.length === 0) {
    logger.fatal("BOT_TOKENS is empty");
    process.exit(1);
  }

  if (botTokens.length !== 10) {
    logger.warn(
      `Expected 10 bot tokens, got ${botTokens.length}. Service will continue.`
    );
  }

  return {
    databaseUrl,
    botTokens,
    autoReplyMessage,
    dropPendingUpdates,
  };
}

export const config = loadConfig();
export { logger };
