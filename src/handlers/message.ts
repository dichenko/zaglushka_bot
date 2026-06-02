import { Context } from 'grammy';
import { runAgent } from '../agent/index.js';
import { 
  createConversation, 
  getActiveConversation, 
  saveMessage,
  updateConversationActivity,
  getBotFirstMessage,
} from '../db.js';
import { logger } from '../config.js';

/**
 * Handle text messages from users
 */
export async function handleTextMessage(ctx: Context, botInfo: { botLink: string }) {
  try {
    const tgId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;
    const messageText = ctx.message?.text;

    if (!tgId || !messageText) {
      logger.warn('Received message without tgId or text');
      return;
    }

    // Get or create conversation
    let conversation = await getActiveConversation(tgId, botInfo.botLink);
    
    if (!conversation) {
      conversation = {
        id: await createConversation(tgId, botInfo.botLink),
        status: 'active',
      };

      // Inject bot first_message as initial assistant message for LLM context
      const firstMsg = await getBotFirstMessage(botInfo.botLink);
      if (firstMsg) {
        await saveMessage(conversation.id, 'assistant', firstMsg);
      }

      logger.info({ conversationId: conversation.id, tgId }, 'New conversation created');
    }

    // Update conversation activity
    await updateConversationActivity(conversation.id);

    // Save user message
    await saveMessage(conversation.id, 'user', messageText);

    // Run AI agent
    const response = await runAgent(
      conversation.id,
      messageText,
      {
        username,
        firstName,
        lastName,
        tgId,
        botLink: botInfo.botLink,
      },
      ctx.api
    );

    // Send response to user
    await ctx.reply(response);

    logger.info({ 
      conversationId: conversation.id, 
      tgId,
      messageLength: messageText.length 
    }, 'Text message handled');
  } catch (error) {
    logger.error({ error }, 'Failed to handle text message');
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}
