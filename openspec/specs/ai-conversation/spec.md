# AI Conversation

## Purpose

Powers AI-driven dialog through a LangChain ReAct agent with PostgreSQL-backed conversation memory. The agent interprets user messages, maintains conversation context, and decides when to use the send_to_admin escalation tool.

## Requirements

### Requirement: LLM Configuration
The system SHALL initialize a ChatOpenAI model using LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL from environment variables. The model SHALL use temperature 0.7.

#### Scenario: Agent creation with DeepSeek
- **WHEN** LLM_PROVIDER=deepseek and LLM_BASE_URL=https://api.deepseek.com/v1
- **THEN** the ChatOpenAI model is configured with those endpoints

### Requirement: ReAct Agent
The system SHALL create a ReAct agent via @langchain/langgraph/prebuilt with two tools: send_to_admin. The agent SHALL follow the system prompt to decide tool usage.

#### Scenario: Agent responds directly to greeting
- **WHEN** user says "Hello"
- **THEN** the agent responds with a greeting without calling any tool

#### Scenario: Agent escalates on user request
- **WHEN** user says "I want to talk to a manager"
- **THEN** the agent calls the send_to_admin tool

### Requirement: System Prompt Management
The system SHALL load the active system prompt from the system_prompts table (latest version WHERE is_active = true). If no prompt exists in the database, a hardcoded default prompt SHALL be used. The prompt SHALL be cached for 60 seconds with invalidation on update.

#### Scenario: Custom prompt from database
- **WHEN** an admin has configured a system prompt in the database
- **THEN** the agent uses that prompt; cached for 60 seconds

#### Scenario: No prompt configured
- **WHEN** system_prompts table is empty
- **THEN** the hardcoded default prompt is used

### Requirement: Conversation Memory
The system SHALL persist conversation history in PostgreSQL via PostgresChatMessageHistory. Each conversation SHALL load its last 50 messages. Messages SHALL be converted to LangChain HumanMessage/AIMessage objects.

#### Scenario: Continued conversation with context
- **WHEN** user has 5 previous messages in this conversation
- **THEN** those 5 messages are loaded as memory and included in the agent's input

### Requirement: Conversation Lifecycle
The system SHALL create one conversation per (tg_id, bot_link) pair when a user sends their first message. Only the latest active conversation is reused. Conversations SHALL be closed (status = escalated or completed) when the send_to_admin tool fires or when completed.

#### Scenario: First message creates conversation
- **WHEN** user sends their first message to a bot
- **THEN** a new conversation row with status=active is created

#### Scenario: Subsequent messages reuse conversation
- **WHEN** user with an active conversation sends another message
- **THEN** the existing active conversation is reused

### Requirement: Message Persistence
The system SHALL save both user messages and assistant responses to the messages table. Messages SHALL include role, content, message_type, and optional metadata (audio_file_id, transcription).

#### Scenario: Text message exchange stored
- **WHEN** user sends text and agent replies with text
- **THEN** two message rows are saved: one with role=user and one with role=assistant

### Requirement: Agent Error Handling
The system SHALL catch agent execution errors and return a fallback message: "Произошла ошибка. Пожалуйста, попробуйте позже."

#### Scenario: LLM API unavailable
- **WHEN** the LLM API call fails
- **THEN** the error is logged and the user receives the fallback message
