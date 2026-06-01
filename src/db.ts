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

  const sql001 = readFileSync(join(migrationsDir, "001_init.sql"), "utf-8");
  const sql002 = readFileSync(join(migrationsDir, "002_ai_agent.sql"), "utf-8");

  try {
    await pool.query(sql001);
    logger.info("Migration 001_init applied");
    
    await pool.query(sql002);
    logger.info("Migration 002_ai_agent applied");
  } catch (err) {
    logger.fatal({ err }, "Failed to apply migration");
    process.exit(1);
  }
}

export async function upsertBotContact(params: {
  tgId: number;
  botLink: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bot_contacts (tg_id, bot_link, username, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tg_id, bot_link)
     DO UPDATE SET 
       updated_at = now(),
       username = COALESCE(EXCLUDED.username, bot_contacts.username),
       first_name = COALESCE(EXCLUDED.first_name, bot_contacts.first_name),
       last_name = COALESCE(EXCLUDED.last_name, bot_contacts.last_name),
       phone = COALESCE(EXCLUDED.phone, bot_contacts.phone)`,
    [params.tgId, params.botLink, params.username, params.firstName, params.lastName, params.phone]
  );
}

// ==========================================
// Bot Configs
// ==========================================

export async function getActiveBots(): Promise<Array<{
  id: number;
  token: string;
  bot_link: string | null;
  bot_name: string | null;
  bot_description: string | null;
  is_active: boolean;
}>> {
  const result = await pool.query(
    'SELECT id, token, bot_link, bot_name, bot_description, is_active FROM bot_configs WHERE is_active = true'
  );
  return result.rows;
}

export async function createBot(data: {
  token: string;
  bot_name?: string;
  bot_description?: string;
}): Promise<void> {
  await pool.query(
    'INSERT INTO bot_configs (token, bot_name, bot_description) VALUES ($1, $2, $3)',
    [data.token, data.bot_name, data.bot_description]
  );
}

export async function updateBot(id: number, data: {
  token?: string;
  bot_name?: string;
  bot_description?: string;
  is_active?: boolean;
}): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.token !== undefined) {
    fields.push(`token = $${paramIndex++}`);
    values.push(data.token);
  }
  if (data.bot_name !== undefined) {
    fields.push(`bot_name = $${paramIndex++}`);
    values.push(data.bot_name);
  }
  if (data.bot_description !== undefined) {
    fields.push(`bot_description = $${paramIndex++}`);
    values.push(data.bot_description);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(data.is_active);
  }

  fields.push(`updated_at = now()`);
  values.push(id);

  await pool.query(
    `UPDATE bot_configs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function deleteBot(id: number): Promise<void> {
  await pool.query(
    'UPDATE bot_configs SET is_active = false, updated_at = now() WHERE id = $1',
    [id]
  );
}

export async function syncBotLink(id: number, botLink: string): Promise<void> {
  await pool.query(
    'UPDATE bot_configs SET bot_link = $1, updated_at = now() WHERE id = $2',
    [botLink, id]
  );
}

// ==========================================
// System Prompts
// ==========================================

export async function getActiveSystemPrompt(): Promise<string | null> {
  const result = await pool.query(
    'SELECT prompt_text FROM system_prompts WHERE is_active = true ORDER BY version DESC LIMIT 1'
  );
  return result.rows[0]?.prompt_text || null;
}

export async function createSystemPrompt(text: string, createdBy?: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Deactivate all existing prompts
    await client.query('UPDATE system_prompts SET is_active = false');
    
    // Get next version number
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM system_prompts'
    );
    const nextVersion = versionResult.rows[0].next_version;
    
    // Create new active prompt
    await client.query(
      'INSERT INTO system_prompts (prompt_text, version, is_active, created_by) VALUES ($1, $2, true, $3)',
      [text, nextVersion, createdBy]
    );
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// First Messages
// ==========================================

export async function getActiveFirstMessage(): Promise<string | null> {
  const result = await pool.query(
    'SELECT message_text FROM first_messages WHERE is_active = true LIMIT 1'
  );
  return result.rows[0]?.message_text || null;
}

export async function updateFirstMessage(text: string, updatedBy?: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Deactivate all existing messages
    await client.query('UPDATE first_messages SET is_active = false');
    
    // Create new active message
    await client.query(
      'INSERT INTO first_messages (message_text, is_active, updated_by) VALUES ($1, true, $2)',
      [text, updatedBy]
    );
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// Admin Tokens
// ==========================================

export async function createAdminToken(tgId: number): Promise<string> {
  const result = await pool.query(
    `INSERT INTO admin_tokens (tg_id, expires_at) 
     VALUES ($1, now() + interval '1 hour') 
     RETURNING token`,
    [tgId]
  );
  return result.rows[0].token;
}

export async function validateAdminToken(token: string): Promise<number | null> {
  const result = await pool.query(
    `SELECT tg_id FROM admin_tokens 
     WHERE token = $1 AND used = false AND expires_at > now()`,
    [token]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  // Mark token as used
  await pool.query(
    'UPDATE admin_tokens SET used = true WHERE token = $1',
    [token]
  );
  
  return result.rows[0].tg_id;
}

export async function isAdmin(tgId: number): Promise<boolean> {
  // This will be checked against ADMIN_TG_IDS from config
  return true; // Implementation in auth middleware
}

// ==========================================
// Conversations
// ==========================================

export async function createConversation(tgId: number, botLink: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO conversations (tg_id, bot_link) 
     VALUES ($1, $2) 
     RETURNING id`,
    [tgId, botLink]
  );
  return result.rows[0].id;
}

export async function getActiveConversation(tgId: number, botLink: string): Promise<{
  id: string;
  status: string;
} | null> {
  const result = await pool.query(
    `SELECT id, status FROM conversations 
     WHERE tg_id = $1 AND bot_link = $2 AND status = 'active' 
     ORDER BY updated_at DESC 
     LIMIT 1`,
    [tgId, botLink]
  );
  return result.rows[0] || null;
}

export async function closeConversation(conversationId: string, status: 'completed' | 'escalated' = 'completed'): Promise<void> {
  await pool.query(
    `UPDATE conversations 
     SET status = $1, ended_at = now(), updated_at = now() 
     WHERE id = $2`,
    [status, conversationId]
  );
}

export async function updateConversationActivity(conversationId: string): Promise<void> {
  await pool.query(
    'UPDATE conversations SET updated_at = now() WHERE id = $1',
    [conversationId]
  );
}

// ==========================================
// Messages
// ==========================================

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: {
    messageType?: 'text' | 'voice' | 'image';
    audioFileId?: string;
    transcription?: string;
    toolCalls?: string;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, message_type, audio_file_id, transcription, tool_calls)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      conversationId,
      role,
      content,
      metadata?.messageType || 'text',
      metadata?.audioFileId,
      metadata?.transcription,
      metadata?.toolCalls
    ]
  );
}

export async function getConversationHistory(
  conversationId: string,
  limit: number = 50
): Promise<Array<{
  role: string;
  content: string;
  message_type: string;
  transcription: string | null;
}>> {
  const result = await pool.query(
    `SELECT role, content, message_type, transcription 
     FROM messages 
     WHERE conversation_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse(); // Return in chronological order
}

// ==========================================
// Leads
// ==========================================

export async function createLead(data: {
  conversationId: string;
  tgId: number;
  botLink: string;
  username?: string;
  telegramLink?: string;
  summary: string;
  contacts?: string;
  telegramMessageId?: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO leads (conversation_id, tg_id, bot_link, username, telegram_link, summary, contacts, telegram_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.conversationId,
      data.tgId,
      data.botLink,
      data.username,
      data.telegramLink,
      data.summary,
      data.contacts,
      data.telegramMessageId
    ]
  );
}

// ==========================================
// Conversations List (for admin panel)
// ==========================================

export async function getConversations(params: {
  tgId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}): Promise<{
  data: Array<{
    id: string;
    tg_id: number;
    bot_link: string;
    status: string;
    started_at: Date;
    updated_at: Date;
  }>;
  total: number;
}> {
  let whereClause = 'WHERE 1=1';
  const values: any[] = [];
  let paramIndex = 1;

  if (params.tgId) {
    whereClause += ` AND tg_id = $${paramIndex++}`;
    values.push(params.tgId);
  }
  if (params.dateFrom) {
    whereClause += ` AND started_at >= $${paramIndex++}`;
    values.push(params.dateFrom);
  }
  if (params.dateTo) {
    whereClause += ` AND started_at <= $${paramIndex++}`;
    values.push(params.dateTo);
  }

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM conversations ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count);

  // Get data with pagination
  values.push(params.limit, params.offset);
  const dataResult = await pool.query(
    `SELECT id, tg_id, bot_link, status, started_at, updated_at 
     FROM conversations 
     ${whereClause}
     ORDER BY updated_at DESC 
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  return {
    data: dataResult.rows,
    total
  };
}

export async function getMessagesByConversation(conversationId: string): Promise<Array<{
  id: number;
  role: string;
  content: string;
  message_type: string;
  transcription: string | null;
  tool_calls: string | null;
  created_at: Date;
}>> {
  const result = await pool.query(
    `SELECT id, role, content, message_type, transcription, tool_calls, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info("Database pool closed");
}
