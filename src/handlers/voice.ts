import { Context } from 'grammy';
import { runAgent } from '../agent/index.js';
import { transcribeVoice } from '../stt/index.js';
import { 
  createConversation, 
  getActiveConversation, 
  saveMessage,
  updateConversationActivity,
  getBotFirstMessage,
} from '../db.js';
import { logger } from '../config.js';

/**
 * Handle voice messages from users
 */
export async function handleVoiceMessage(ctx: Context, botInfo: { botLink: string }) {
  try {
    const tgId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;

    if (!tgId) {
      logger.warn('Received voice message without tgId');
      return;
    }

    // Get voice file ID
    const voiceMessage = ctx.message?.voice;
    if (!voiceMessage) {
      logger.warn('No voice message found in context');
      return;
    }

    const audioFileId = voiceMessage.file_id;

    // Show typing indicator
    await ctx.reply('⏳ Распознаю голосовое сообщение...');

    // Transcribe voice message
    const transcription = await transcribeVoice(audioFileId, ctx);

    // Get or create conversation
    let conversation = await getActiveConversation(tgId, botInfo.botLink);
    
    if (!conversation) {
      conversation = {
        id: await createConversation(tgId, botInfo.botLink),
        status: 'active',
      };

      const firstMsg = await getBotFirstMessage(botInfo.botLink);
      if (firstMsg) {
        await saveMessage(conversation.id, 'assistant', firstMsg);
      }

      logger.info({ conversationId: conversation.id, tgId }, 'New conversation created for voice message');
    }

    // Update conversation activity
    await updateConversationActivity(conversation.id);

    // Save user message with transcription
    await saveMessage(conversation.id, 'user', transcription, {
      messageType: 'voice',
      audioFileId,
      transcription,
    });

    // Run AI agent with transcribed text
    const response = await runAgent(
      conversation.id,
      transcription,
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
      transcriptionLength: transcription.length 
    }, 'Voice message handled');
  } catch (error) {
    logger.error({ error }, 'Failed to handle voice message');
    await ctx.reply('Не удалось распознать голосовое сообщение. Пожалуйста, напишите текстом.');
  }
}
