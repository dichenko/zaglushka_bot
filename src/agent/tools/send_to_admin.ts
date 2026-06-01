import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { config, logger } from '../config.js';
import { createLead, closeConversation } from '../db.js';

// Telegram Bot API instance (will be injected)
let botApi: any = null;

/**
 * Set the bot API instance for sending messages
 */
export function setBotApi(api: any): void {
  botApi = api;
}

/**
 * Send to admin tool for LangChain agent
 */
export const sendToAdminTool = new DynamicStructuredTool({
  name: 'send_to_admin',
  description: 'Отправить заявку администраторам с резюме диалога и контактами пользователя. Вызывайте этот инструмент когда пользователь хочет оставить заявку или задать вопрос администраторам.',
  schema: z.object({
    summary: z.string().describe('Резюме диалога и потребности пользователя'),
    contacts: z.string().describe('Контактные данные пользователя (телефон, email и т.д.)'),
    username: z.string().describe('Username пользователя в Telegram (без @)'),
    telegram_link: z.string().describe('Ссылка на профиль Telegram (https://t.me/username)'),
  }),
  func: async ({ summary, contacts, username, telegram_link }) => {
    try {
      if (!botApi) {
        throw new Error('Bot API not initialized');
      }

      // Format message for admin chat
      const message = `📩 Новая заявка от @${username}

👤 Контакты:
${contacts || 'Не предоставлены'}

📝 Резюме:
${summary}

🔗 Профиль: ${telegram_link}
⏰ Время: ${new Date().toLocaleString('ru-RU')}`;

      // Send message to admin chat
      const sentMessage = await botApi.sendMessage(config.adminChatId, message, {
        parse_mode: 'HTML',
      });

      logger.info({ 
        adminChatId: config.adminChatId, 
        messageId: sentMessage.message_id,
        username 
      }, 'Lead sent to admin chat');

      return `Заявка успешно отправлена администраторам. Сообщение ID: ${sentMessage.message_id}`;
    } catch (error) {
      logger.error({ error }, 'Failed to send lead to admin chat');
      throw new Error('Не удалось отправить заявку. Попробуйте позже.');
    }
  },
});

/**
 * Save lead to database after tool execution
 */
export async function saveLeadToDatabase(params: {
  conversationId: string;
  tgId: number;
  botLink: string;
  username?: string;
  telegramLink?: string;
  summary: string;
  contacts?: string;
  telegramMessageId: number;
}): Promise<void> {
  try {
    await createLead({
      conversationId: params.conversationId,
      tgId: params.tgId,
      botLink: params.botLink,
      username: params.username,
      telegramLink: params.telegramLink,
      summary: params.summary,
      contacts: params.contacts,
      telegramMessageId: params.telegramMessageId,
    });

    // Close conversation as escalated
    await closeConversation(params.conversationId, 'escalated');

    logger.info({ conversationId: params.conversationId }, 'Lead saved to database');
  } catch (error) {
    logger.error({ error }, 'Failed to save lead to database');
  }
}
