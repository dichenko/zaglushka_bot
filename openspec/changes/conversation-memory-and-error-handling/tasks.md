## 1. Conversation Memory Limit

- [ ] 1.1 Change `getConversationHistory` limit from 50 to 10 in `src/agent/memory.ts:40`
- [ ] 1.2 Extract the limit to a named constant `MEMORY_MESSAGE_LIMIT = 10` at the top of `src/agent/memory.ts`

## 2. Conversation on /start Command

- [ ] 2.1 Add `createConversation` call in `/start` handler in `src/bots.ts` after `upsertBotContact` and before sending the welcome reply
- [ ] 2.2 Pass `botLink` to the `/start` handler closure for use in `createConversation(tgId, botLink)`
- [ ] 2.3 Add `createConversation` to the import from `./db.js` in `src/bots.ts`

## 3. Admin Error Notification Utility

- [ ] 3.1 Create `src/notify.ts` with a `notifyAdminError(botApi, errorContext)` function that sends a plain-text message to `ADMIN_CHAT_ID` with tg_id, bot_link, conversation_id, and error message
- [ ] 3.2 Wrap the `sendMessage` call in its own try/catch to prevent notification failures from cascading

## 4. Agent Error Notification

- [ ] 4.1 In `src/agent/index.ts` `runAgent()` catch block, call `notifyAdminError()` before re-throwing the fallback error
- [ ] 4.2 Pass `botApi` and all error context (tgId, botLink, conversationId) from `userInfo` and `conversationId`

## 5. Handler Error Notification

- [ ] 5.1 In `src/handlers/message.ts` catch block, call `notifyAdminError()` before sending the fallback reply to the user
- [ ] 5.2 In `src/handlers/voice.ts` catch block, call `notifyAdminError()` before sending the fallback reply to the user

## 6. Verification

- [ ] 6.1 Run `npx tsc --noEmit` to verify all TypeScript compiles without errors
- [ ] 6.2 Review that the fallback message `"Произошла ошибка. Пожалуйста, попробуйте позже."` is consistent across all error paths (agent, message handler, voice handler)
