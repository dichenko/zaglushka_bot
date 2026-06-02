import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { config, logger } from '../../config.js';
import { createLead, closeConversation, upsertBotContact } from '../../db.js';

let botApi: any = null;
let currentUserInfo: {
  tgId: number;
  botLink: string;
  username?: string;
  firstName?: string;
  lastName?: string;
} | null = null;

export function setBotApi(api: any): void {
  botApi = api;
}

export function setUserInfo(info: {
  tgId: number;
  botLink: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}): void {
  currentUserInfo = info;
}

export const sendToAdminTool = new DynamicStructuredTool({
  name: 'send_to_admin',
  description: 'Отправить заявку администраторам. Используйте когда пользователь хочет оставить заявку, связаться с менеджером или запросить обратную связь.',
  schema: z.object({
    summary: z.string().describe('Резюме диалога и потребности пользователя'),
    contacts: z.string().describe('Контактные данные пользователя: телефон, email (если не предоставлены — "Не предоставлены")'),
  }),
  func: async (input: unknown) => {
    const { summary, contacts } = input as { summary: string; contacts: string };
    try {
      if (!botApi) throw new Error('Bot API not initialized');
      if (!currentUserInfo) throw new Error('User info not set');

      const u = currentUserInfo;
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Не указано';
      const telegramLink = u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.tgId}`;

      const message =
        `📩 <b>Новая заявка</b>\n\n` +
        `<b>👤 Пользователь:</b>\n` +
        `ID: <code>${u.tgId}</code>\n` +
        `Имя: ${fullName}\n` +
        (u.username ? `Username: @${u.username}\n` : '') +
        `Профиль: ${telegramLink}\n\n` +
        `<b>📋 Контакты:</b>\n${contacts || 'Не предоставлены'}\n\n` +
        `<b>📝 Резюме:</b>\n${summary}\n\n` +
        `⏰ ${new Date().toLocaleString('ru-RU')}`;

      const sentMessage = await botApi.sendMessage(config.adminChatId, message, {
        parse_mode: 'HTML',
      });

      logger.info({ adminChatId: config.adminChatId, messageId: sentMessage.message_id, tgId: u.tgId }, 'Lead sent to admin chat');

      // Store result for saveLeadToDatabase
      (sendToAdminTool as any).lastResult = {
        messageId: sentMessage.message_id,
        tgId: u.tgId,
        botLink: u.botLink,
        username: u.username,
        telegramLink,
      };

      return `Заявка успешно отправлена администраторам. Сообщение ID: ${sentMessage.message_id}`;
    } catch (error) {
      logger.error({ error }, 'Failed to send lead to admin chat');
      throw new Error('Не удалось отправить заявку. Попробуйте позже.');
    }
  },
});

export async function saveLeadToDatabase(params: {
  conversationId: string;
  tgId: number;
  botLink: string;
  summary: string;
}): Promise<void> {
  try {
    const last = (sendToAdminTool as any).lastResult || {};
    await createLead({
      conversationId: params.conversationId,
      tgId: params.tgId,
      botLink: params.botLink,
      username: last.username || currentUserInfo?.username,
      telegramLink: last.telegramLink,
      summary: params.summary,
      contacts: '',
      telegramMessageId: last.messageId || 0,
    });

    await closeConversation(params.conversationId, 'escalated');
    logger.info({ conversationId: params.conversationId }, 'Lead saved to database');
  } catch (error) {
    logger.error({ error }, 'Failed to save lead to database');
  }
}
