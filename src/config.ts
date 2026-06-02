import dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

interface AppConfig {
  databaseUrl: string;
  botTokens: string[]; // Deprecated, kept for backward compatibility
  autoReplyMessage: string; // Deprecated, kept for backward compatibility
  dropPendingUpdates: boolean;
  
  // Admin Panel
  adminTgIds: string[];
  adminSessionSecret: string;
  adminSessionMaxAge: number; // milliseconds
  adminPort: number;
  adminBaseUrl: string;
  
  // AI/LLM
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  
  // STT
  muxlisaBaseUrl: string;
  muxlisaApiKey: string;
  muxlisaSttTimeoutMs: number;
  muxlisaTtsTimeoutMs: number;
  muxlisaMaxAudioSizeMb: number;
  muxlisaMaxAudioDurationSec: number;
  muxlisaTtsMaxChars: number;
  muxlisaTtsSpeaker: number;
  openaiSttModel: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  sttFallbackConfidenceThreshold: number;
  sttMaxRetries: number;
  
  // Telegram
  adminChatId: string;
  
  // Agent
  agentMaxConversationTurns: number;
  agentInactivityTimeoutMinutes: number;
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

  // Parse bot tokens (deprecated, but kept for backward compatibility)
  const botTokens = botTokensRaw
    ? botTokensRaw.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
    : [];

  // Parse admin TG IDs
  const adminTgIdsRaw = process.env.ADMIN_TG_IDS;
  if (!adminTgIdsRaw) {
    logger.fatal("ADMIN_TG_IDS is not set");
    process.exit(1);
  }
  const adminTgIds = adminTgIdsRaw.split(",").map((id) => id.trim()).filter((id) => id.length > 0);

  // Admin session secret
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!adminSessionSecret) {
    logger.fatal("ADMIN_SESSION_SECRET is not set");
    process.exit(1);
  }

  // Admin session max age (default 24 hours)
  const adminSessionMaxAgeHours = parseInt(process.env.ADMIN_SESSION_MAX_AGE_HOURS || "24");
  const adminSessionMaxAge = adminSessionMaxAgeHours * 60 * 60 * 1000; // convert to milliseconds

  // Admin port (default 3050)
  const adminPort = parseInt(process.env.ADMIN_PORT || "3050");

  // Admin base URL
  const adminBaseUrl = process.env.ADMIN_BASE_URL || `http://localhost:${adminPort}`;

  // LLM Configuration
  const llmProvider = process.env.LLM_PROVIDER || "deepseek";
  const llmBaseUrl = process.env.LLM_BASE_URL || "https://api.deepseek.com/v1";
  const llmApiKey = process.env.LLM_API_KEY;
  if (!llmApiKey) {
    logger.fatal("LLM_API_KEY is not set");
    process.exit(1);
  }
  const llmModel = process.env.LLM_MODEL || "deepseek-chat";

  // STT Configuration - MUXLISA
  const muxlisaBaseUrl = process.env.MUXLISA_BASE_URL || "https://service.muxlisa.uz";
  const muxlisaApiKey = process.env.MUXLISA_API_KEY || "";
  const muxlisaSttTimeoutMs = parseInt(process.env.MUXLISA_STT_TIMEOUT_MS || "60000");
  const muxlisaTtsTimeoutMs = parseInt(process.env.MUXLISA_TTS_TIMEOUT_MS || "60000");
  const muxlisaMaxAudioSizeMb = parseInt(process.env.MUXLISA_MAX_AUDIO_SIZE_MB || "5");
  const muxlisaMaxAudioDurationSec = parseInt(process.env.MUXLISA_MAX_AUDIO_DURATION_SEC || "60");
  const muxlisaTtsMaxChars = parseInt(process.env.MUXLISA_TTS_MAX_CHARS || "1512");
  const muxlisaTtsSpeaker = parseInt(process.env.MUXLISA_TTS_SPEAKER || "0");

  // STT Configuration - OpenAI
  const openaiSttModel = process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe";
  const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const openaiApiKey = process.env.OPENAI_API_KEY || "";

  // STT Fallback settings
  const sttFallbackConfidenceThreshold = parseFloat(process.env.STT_FALLBACK_CONFIDENCE_THRESHOLD || "0.7");
  const sttMaxRetries = parseInt(process.env.STT_MAX_RETRIES || "2");

  // Telegram admin chat
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!adminChatId) {
    logger.fatal("ADMIN_CHAT_ID is not set");
    process.exit(1);
  }

  // Agent settings
  const agentMaxConversationTurns = parseInt(process.env.AGENT_MAX_CONVERSATION_TURNS || "50");
  const agentInactivityTimeoutMinutes = parseInt(process.env.AGENT_INACTIVITY_TIMEOUT_MINUTES || "30");

  if (botTokens.length === 0) {
    logger.warn("BOT_TOKENS is not set. Bots must be configured via admin panel.");
  }

  if (!autoReplyMessage) {
    logger.warn("AUTO_REPLY_MESSAGE is not set. Using first_message from database.");
  }

  return {
    databaseUrl,
    botTokens,
    autoReplyMessage: autoReplyMessage || "",
    dropPendingUpdates,
    adminTgIds,
    adminSessionSecret,
    adminSessionMaxAge,
    adminPort,
    adminBaseUrl,
    llmProvider,
    llmBaseUrl,
    llmApiKey,
    llmModel,
    muxlisaBaseUrl,
    muxlisaApiKey,
    muxlisaSttTimeoutMs,
    muxlisaTtsTimeoutMs,
    muxlisaMaxAudioSizeMb,
    muxlisaMaxAudioDurationSec,
    muxlisaTtsMaxChars,
    muxlisaTtsSpeaker,
    openaiSttModel,
    openaiBaseUrl,
    openaiApiKey,
    sttFallbackConfidenceThreshold,
    sttMaxRetries,
    adminChatId,
    agentMaxConversationTurns,
    agentInactivityTimeoutMinutes,
  };
}

export const config = loadConfig();
export { logger };
