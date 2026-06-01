# Lead Escalation

## Purpose

Enables the AI agent to escalate conversations to human administrators. The agent uses a send_to_admin tool to deliver formatted lead summaries to a Telegram admin chat and persist lead records in the database.

## Requirements

### Requirement: Send-to-Admin Tool
The system SHALL provide a LangChain DynamicStructuredTool named send_to_admin with schema fields: summary, contacts, username, telegram_link. The tool SHALL be registered in the ReAct agent's toolset.

#### Scenario: Agent invokes send_to_admin
- **WHEN** the agent decides to escalate based on system prompt instructions
- **THEN** the tool is called with collected summary, contacts, username, and telegram_link

### Requirement: Admin Chat Delivery
The tool SHALL format a lead message with username, contacts, summary, profile link, and timestamp, and send it to ADMIN_CHAT_ID via Telegram Bot API with parse_mode HTML.

#### Scenario: Lead delivered to admin chat
- **WHEN** send_to_admin is invoked with user data
- **THEN** a formatted message appears in the admin Telegram chat with the lead details

#### Scenario: Admin chat unavailable
- **WHEN** ADMIN_CHAT_ID is invalid or bot lacks send permissions
- **THEN** the error is logged and the tool throws an error to the agent

### Requirement: Lead Database Record
After the tool sends a message to admin chat, the system SHALL create a leads row in the database with conversation_id, tg_id, bot_link, username, telegram_link, summary, contacts, and telegram_message_id. The associated conversation SHALL be closed (status = escalated).

#### Scenario: Lead saved to database
- **WHEN** the tool successfully sends to admin chat
- **THEN** a leads row is created; the conversation status changes to escalated with ended_at set

### Requirement: Tool Not Initialized Handling
If the botApi reference is null when the tool is called, the tool SHALL throw an error: "Bot API not initialized".

#### Scenario: Tool called before botApi is set
- **WHEN** send_to_admin is invoked but setBotApi() was not called yet
- **THEN** the tool throws "Bot API not initialized"
