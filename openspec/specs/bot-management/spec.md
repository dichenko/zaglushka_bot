# Bot Management

## Purpose

Manages the lifecycle of multiple Telegram bots from a database-driven configuration. Bots are loaded from the bot_configs table, initialized with polling, and register handlers for text, voice, commands, and admin access.

## Requirements

### Requirement: Database-Driven Bot Configuration
The system SHALL load active bots from the bot_configs table WHERE is_active = true. Bots configured via the legacy BOT_TOKENS environment variable are NOT automatically started.

#### Scenario: Bots loaded from database
- **WHEN** the service starts and bot_configs has 3 active rows
- **THEN** all 3 bots are initialized and begin polling

#### Scenario: No bots configured
- **WHEN** bot_configs has no active rows
- **THEN** a warning is logged and the service continues running (admin panel remains accessible)

### Requirement: Bot Initialization Lifecycle
For each active bot, the system SHALL: delete any existing webhook, optionally drop pending updates, resolve bot_link via getMe(), sync the link back to bot_configs, register message and command handlers, and start long-polling.

#### Scenario: Successful bot initialization
- **WHEN** a valid bot token is loaded from bot_configs
- **THEN** webhook is deleted; pending updates are dropped (if DROP_PENDING_UPDATES=true); bot_link is resolved to https://t.me/{username}; handlers for /start, /admin, message:text, message:voice are registered; polling begins

### Requirement: Fault-Tolerant Bot Startup
The system SHALL continue starting remaining bots if a single bot fails. Errors for individual bot failures SHALL be logged.

#### Scenario: One invalid token among many
- **WHEN** bot #2 has an invalid token and bots #1, #3, #4 are valid
- **THEN** bot #2 error is logged; bots #1, #3, #4 start and poll normally

### Requirement: Command Handlers
The system SHALL handle /start by saving the contact and replying with the active first_message from the database (or a default fallback). The system SHALL handle /admin by validating the user against ADMIN_TG_IDS and generating a one-time login link.

#### Scenario: User sends /start
- **WHEN** an unregistered user sends /start
- **THEN** their contact is saved; they receive the configured first message

#### Scenario: Admin sends /admin
- **WHEN** a user whose tg_id is in ADMIN_TG_IDS sends /admin
- **THEN** a one-time login URL is generated and sent; the token is stored in admin_tokens

#### Scenario: Non-admin sends /admin
- **WHEN** a user not in ADMIN_TG_IDS sends /admin
- **THEN** they receive "У вас нет доступа к админ-панели"
