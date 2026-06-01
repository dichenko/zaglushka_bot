## MODIFIED Requirements

### Requirement: Conversation Memory
The system SHALL persist conversation history in PostgreSQL via PostgresChatMessageHistory. Each conversation SHALL load its last 10 messages. Messages SHALL be converted to LangChain HumanMessage/AIMessage objects.

#### Scenario: Continued conversation with context
- **WHEN** user has 10 previous messages in this conversation
- **THEN** those 10 messages are loaded as memory and included in the agent's input

#### Scenario: Fewer than 10 messages available
- **WHEN** user has fewer than 10 messages in this conversation
- **THEN** all available messages are loaded as memory

#### Scenario: No messages in conversation
- **WHEN** user has no previous messages in this conversation
- **THEN** only the system prompt and current user message are passed to the agent

### Requirement: Conversation Lifecycle
The system SHALL create one conversation per (tg_id, bot_link) pair when a user sends their first message or `/start` command. Only the latest active conversation is reused. Conversations SHALL be closed (status = escalated or completed) when the send_to_admin tool fires or when completed.

#### Scenario: First message creates conversation
- **WHEN** user sends their first message to a bot
- **THEN** a new conversation row with status=active is created

#### Scenario: /start command creates conversation
- **WHEN** user sends the `/start` command to a bot for the first time
- **THEN** a new conversation row with status=active is created alongside the welcome message reply

#### Scenario: Subsequent messages reuse conversation
- **WHEN** user with an active conversation sends another message
- **THEN** the existing active conversation is reused

### Requirement: Agent Error Handling
The system SHALL catch agent execution errors and return a fallback message: "Произошла ошибка. Пожалуйста, попробуйте позже." The system SHALL also send a notification to ADMIN_CHAT_ID with the error text, tg_id, bot_link, and conversation_id for administrator awareness.

#### Scenario: LLM API unavailable
- **WHEN** the LLM API call fails
- **THEN** the error is logged, the user receives the fallback message, and a notification is sent to ADMIN_CHAT_ID with the error details and conversation context

#### Scenario: Agent tool execution fails
- **WHEN** agent encounters an error during tool execution
- **THEN** the error is logged, the user receives the fallback message, and a notification is sent to ADMIN_CHAT_ID

#### Scenario: Admin notification failure does not cascade
- **WHEN** an agent error occurs BUT the admin notification itself fails to send (e.g., Telegram API down)
- **THEN** the error is still logged, the user still receives the fallback message, and the notification failure is logged separately without affecting the user response
