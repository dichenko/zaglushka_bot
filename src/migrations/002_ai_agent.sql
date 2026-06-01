-- Migration 002: AI Agent and Admin Panel Support

-- 1. bot_configs - Bot configuration (replaces BOT_TOKENS from .env)
CREATE TABLE IF NOT EXISTS bot_configs (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  bot_link TEXT UNIQUE,
  bot_name TEXT,
  bot_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_configs_active ON bot_configs(is_active);

-- 2. system_prompts - Versioned system prompts
CREATE TABLE IF NOT EXISTS system_prompts (
  id BIGSERIAL PRIMARY KEY,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT -- tg_id of admin who created it
);

CREATE INDEX idx_system_prompts_active ON system_prompts(is_active);
CREATE INDEX idx_system_prompts_version ON system_prompts(version DESC);

-- 3. first_messages - First message for new users
CREATE TABLE IF NOT EXISTS first_messages (
  id BIGSERIAL PRIMARY KEY,
  message_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT -- tg_id of admin who updated it
);

-- Only one active record allowed
CREATE UNIQUE INDEX idx_first_messages_active ON first_messages(is_active) WHERE is_active = true;

-- 4. admin_tokens - Temporary tokens for admin panel access
CREATE TABLE IF NOT EXISTS admin_tokens (
  id BIGSERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_tokens_token ON admin_tokens(token);
CREATE INDEX idx_admin_tokens_expires ON admin_tokens(expires_at);

-- 5. conversations - Dialog sessions
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, escalated
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  
  CONSTRAINT fk_conversation_contact 
    FOREIGN KEY (tg_id, bot_link) 
    REFERENCES bot_contacts(tg_id, bot_link)
);

CREATE INDEX idx_conversations_tg_id ON conversations(tg_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);

-- 6. messages - All message history
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- text, voice, image
  audio_file_id TEXT, -- for voice messages
  transcription TEXT, -- STT result
  tool_calls TEXT, -- JSON array of tool calls if any
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- 7. leads - Submitted leads
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  username TEXT,
  telegram_link TEXT, -- https://t.me/{username}
  summary TEXT NOT NULL, -- dialog summary from agent
  contacts TEXT, -- user contacts (if any)
  telegram_message_id BIGINT, -- ID of message in admin chat
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_conversation ON leads(conversation_id);
CREATE INDEX idx_leads_sent ON leads(sent_at);

-- Update bot_contacts with new fields
ALTER TABLE bot_contacts 
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;
