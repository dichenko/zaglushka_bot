## Why

The conversation memory limit is inconsistent between the spec (5 messages) and the code (50 messages), and must be unified to 10 messages. The `/start` command does not create a conversation row, preventing proper conversation tracking from the first interaction. Agent and LLM errors are only logged locally — administrators receive no real-time notification when the AI service becomes unavailable, delaying incident response.

## What Changes

- **Conversation memory limit**: Unify to 10 messages (was 5 in spec, 50 in code). Agent SHALL load the last 10 messages from conversation history instead of 50.
- **Conversation on /start**: The `/start` command handler SHALL create a new conversation row with `status=active`, matching the behavior of the text/voice message handlers.
- **Admin error notification**: When agent execution fails or the LLM API is unavailable, the system SHALL send a notification to `ADMIN_CHAT_ID` with the error text and context (tg_id, bot_link, conversation_id), in addition to logging the error.
- **Fallback message consistency**: Ensure all agent/LLM error paths return the unified fallback message `"Произошла ошибка. Пожалуйста, попробуйте позже."`

## Capabilities

### New Capabilities
<!-- None introduced — all changes are modifications to existing capabilities -->

### Modified Capabilities
- `ai-conversation`: Conversation memory limit changed from 5/50 to 10 messages. Conversation creation now also triggers on `/start` command. Agent error handling extended to notify admin chat on failures and LLM API unavailability.

## Impact

- **`src/agent/memory.ts`**: `getMessages()` limit parameter changed to 10 (from 50)
- **`src/agent/index.ts`**: `runAgent()` catch block extended to send admin notification via Telegram Bot API on LLM failure
- **`src/bots.ts`**: `/start` command handler extended to create conversation row after upserting contact
- **`src/handlers/message.ts`**: Error catch block extended to send admin notification
- **`src/handlers/voice.ts`**: Error catch block extended to send admin notification
- **`openspec/specs/ai-conversation/spec.md`**: Updated scenarios for memory limit, /start conversation, and error notification
- **`ADMIN_CHAT_ID`** env var: already exists, reused for error notifications
