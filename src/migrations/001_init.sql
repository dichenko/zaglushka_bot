CREATE TABLE IF NOT EXISTS bot_contacts (
  id BIGSERIAL PRIMARY KEY,
  tg_id BIGINT NOT NULL,
  bot_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_tg_contact_per_bot UNIQUE (tg_id, bot_link)
);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_tg_id
ON bot_contacts(tg_id);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_bot_link
ON bot_contacts(bot_link);

CREATE INDEX IF NOT EXISTS idx_bot_contacts_created_at
ON bot_contacts(created_at);
