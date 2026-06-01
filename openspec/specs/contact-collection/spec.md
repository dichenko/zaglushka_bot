# Contact Collection

## Purpose

Tracks unique user contacts per Telegram bot. Each contact is uniquely identified by the pair (tg_id, bot_link). The system ensures no duplicate contacts are created for the same user-bot combination while allowing the same user to appear as separate contacts across different bots.

## Requirements

### Requirement: Unique Contact Pair
The system SHALL identify each contact uniquely by the pair (tg_id, bot_link). No two rows in bot_contacts may have the same tg_id and bot_link simultaneously.

#### Scenario: First contact by user
- **WHEN** a user with tg_id=123 sends their first message to @my_bot
- **THEN** a new row (tg_id=123, bot_link=https://t.me/my_bot) is inserted into bot_contacts

#### Scenario: Repeated contact by same user to same bot
- **WHEN** user 123 sends a second message to @my_bot
- **THEN** no new row is created; the existing row's updated_at is refreshed

#### Scenario: Same user contacts different bots
- **WHEN** user 123 contacts @bot_one and then contacts @bot_two
- **THEN** two distinct rows exist: (123, bot_one_link) and (123, bot_two_link)

### Requirement: UPSERT Logic
The system SHALL use INSERT ON CONFLICT DO UPDATE to save contacts. First contact creates a row; subsequent contacts from the same user to the same bot only update updated_at and refresh metadata fields (username, first_name, last_name, phone) with non-null values.

#### Scenario: Contact metadata refresh
- **WHEN** user 123 who previously had no username sends a message with a username set
- **THEN** the username field is updated on the existing row via COALESCE(EXCLUDED, existing)

### Requirement: Contact Fields Storage
The system SHALL store tg_id, bot_link, username, first_name, last_name, phone, created_at, and updated_at for each contact.

#### Scenario: Contact with full profile
- **WHEN** a user with complete Telegram profile (username, first_name, last_name) sends a message
- **THEN** all available profile fields are stored in the contact row

### Requirement: Database Failure Gracefulness
The system SHALL log errors and continue normal operation if upsertBotContact fails. The user SHALL still receive their auto-response message.

#### Scenario: Database temporarily unavailable
- **WHEN** PostgreSQL is unreachable during contact upsert
- **THEN** the error is logged and the user still receives the reply message
