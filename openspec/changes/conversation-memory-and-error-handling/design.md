## Context

The bot application uses a PostgreSQL-backed conversation system with a LangChain ReAct agent for AI responses. Currently:

- `PostgresChatMessageHistory.getMessages()` loads the last **50** messages (hardcoded in `src/agent/memory.ts:40`)
- The `/start` command handler in `src/bots.ts:64` saves the contact and replies with a welcome message but does NOT create a conversation row — only text/voice handlers do
- Agent errors in `src/agent/index.ts:117-120` and handler errors in `src/handlers/message.ts:66-68` / `voice.ts:85-87` only log via pino; no admin notification is sent
- `ADMIN_CHAT_ID` is already configured in `.env` and used by the `send_to_admin` tool for lead escalation — the infrastructure for sending Telegram messages to admins already exists

## Goals / Non-Goals

**Goals:**
- Unify conversation memory to exactly 10 messages across spec and code
- Create a conversation row on `/start` to track user engagement from the first contact
- Send a Telegram notification to `ADMIN_CHAT_ID` when agent/LLM errors occur, including context (tg_id, bot_link, conversation_id, error message)

**Non-Goals:**
- No new database tables or migrations are needed
- No changes to the lead escalation flow (`send_to_admin` tool)
- No changes to admin panel UI
- No change to STT error handling (voice recognition failures are not LLM failures)

## Decisions

### D1: Memory limit of 10 messages
**Choice**: Set the conversation history limit to 10 messages.
**Rationale**: The user explicitly requested 10 messages. This provides sufficient context for the agent without excessive token usage. The current code loads 50 messages, which is excessive and wastes API costs.
**Alternatives considered**: Keeping 50 — rejected because it inflates API costs and exceeds reasonable context needs for a customer support bot; keeping 5 — rejected per user requirement.

### D2: Conversation creation on /start
**Choice**: Call `createConversation()` in the `/start` handler after `upsertBotContact()`, before replying.
**Rationale**: Consistent with text/voice handlers. Ensures every user interaction is tracked from the very first message. No DB schema change needed — `conversations` table already supports this.
**Alternative considered**: Lazy creation on first text message — rejected because it leaves a gap: `/start` + subsequent messages look like separate events if the user doesn't send text immediately.

### D3: Admin notification via existing bot API
**Choice**: Use the grammY `ctx.api.sendMessage()` or the bot's raw `Bot.api.sendMessage()` to send error notifications to `ADMIN_CHAT_ID`.
**Rationale**: Reuses the already-configured `ADMIN_CHAT_ID` env var and the existing Telegram Bot API connection. No new dependencies or services needed.
**Alternative considered**: Separate notification service (e.g., a dedicated admin bot) — rejected as over-engineering for this scope.

### D4: Notification format
**Choice**: Send a plain-text message with error context, not HTML/Markdown.
**Rationale**: Error messages may contain special characters that break Markdown/HTML parsing. Plain text is reliable.
**Format**: `⚠ Ошибка агента | tg_id: {tgId} | conversation: {conversationId} | {errorMessage}`
**Alternative considered**: JSON structured message — rejected; human-readable is more actionable for admins.

### D5: Admin notification in handler vs agent layer
**Choice**: Add notification in the `runAgent()` catch block in `src/agent/index.ts` (for LLM failures) and in handler catch blocks in `src/handlers/message.ts` and `src/handlers/voice.ts` (for broader handler failures).
**Rationale**: The `runAgent()` function has access to `botApi` and `userInfo` — perfect context for the notification. Handler-level catches cover cases where agent execution itself crashes before reaching `runAgent()`.
**Alternative considered**: Centralized middleware — rejected because grammY error boundaries don't provide session context like conversationId.

## Risks / Trade-offs

- **[Risk] Admin spam on sustained LLM outage**: If the LLM is down for hours, every user message will trigger an admin notification. → **Mitigation**: The notification fires once per agent invocation; in practice, admins will notice quickly. Future enhancement could add rate-limiting.
- **[Risk] Notification failure during bot API outage**: If the Telegram Bot API itself is down, the notification won't reach admins. → **Mitigation**: The error is still logged via pino. The notification send is wrapped in a try/catch to avoid cascading failures.
- **[Risk] 10-message limit may lose context for long conversations**: Some conversations may benefit from more history. → **Mitigation**: 10 messages is the user's explicit request. The config is in a single constant, easy to change later.
