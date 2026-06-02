-- Migration 003: Per-bot first message
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS first_message TEXT;
