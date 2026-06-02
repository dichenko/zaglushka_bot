import { Bot } from "grammy";
import { config, logger } from "./config.js";
import { 
  upsertBotContact, 
  getActiveBots, 
  getBotFirstMessage,
  syncBotLink,
  getActiveConversation,
  closeConversation,
} from "./db.js";
import { handleTextMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { generateAdminLoginLink } from "./admin/auth.js";

interface BotInfo {
  bot: Bot;
  token: string;
  botLink: string;
  id: number;
}

export async function startBots(): Promise<void> {
  // Get active bots from database
  const botConfigs = await getActiveBots();
  
  if (botConfigs.length === 0) {
    logger.warn('No active bots found in database. Please configure bots via admin panel.');
    return;
  }

  logger.info({ count: botConfigs.length }, 'Starting bots from database');

  const activeBots: BotInfo[] = [];

  for (const botConfig of botConfigs) {
    const tokenPreview = botConfig.token.length > 20 
      ? botConfig.token.slice(0, 10) + "..." + botConfig.token.slice(-6) 
      : botConfig.token;

    try {
      const bot = new Bot(botConfig.token);

      // Delete webhook
      await bot.api.deleteWebhook();
      logger.info(`[Bot ${botConfig.id}] Webhook deleted`);

      // Drop pending updates if configured
      if (config.dropPendingUpdates) {
        await bot.api.getUpdates({
          offset: -1,
          timeout: 1,
        });
        logger.info(`[Bot ${botConfig.id}] Pending updates dropped`);
      }

      // Get bot info
      const me = await bot.api.getMe();
      const botLink = `https://t.me/${me.username}`;
      
      // Update bot_link in database
      await syncBotLink(botConfig.id, botLink);
      
      logger.info(`[Bot ${botConfig.id}] @${me.username} ready (token: ${tokenPreview})`);

      // /start command handler
      bot.command("start", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) return;
        const from = ctx.from!;

        try {
          // Close any active conversation to reset dialog history
          const activeConv = await getActiveConversation(tgId, botLink);
          if (activeConv) {
            await closeConversation(activeConv.id, 'completed');
            logger.info({ tgId, botLink, convId: activeConv.id }, 'Conversation closed by /start');
          }

          // Save contact
          await upsertBotContact({ 
            tgId, 
            botLink,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
          });

          // Get per-bot first message, fallback to global, fallback to default
          const firstMessage = botConfig.first_message || await getBotFirstMessage(botLink) || "Здравствуйте! Чем могу помочь?";
          
          await ctx.reply(firstMessage);
          
          logger.info({ tgId, botLink }, 'Start command handled');
        } catch (err) {
          logger.error({ err, tgId, botLink }, "Failed to handle /start command");
        }
      });

      // /restart command handler - clears dialog history
      bot.command("restart", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) return;

        try {
          const activeConv = await getActiveConversation(tgId, botLink);
          if (activeConv) {
            await closeConversation(activeConv.id, 'completed');
            logger.info({ tgId, botLink, convId: activeConv.id }, 'Conversation closed by /restart');
          }

          const firstMessage = botConfig.first_message || await getBotFirstMessage(botLink) || "Здравствуйте! Чем могу помочь?";
          await ctx.reply(firstMessage);
          logger.info({ tgId, botLink }, 'Restart command handled');
        } catch (err) {
          logger.error({ err, tgId, botLink }, 'Failed to handle /restart command');
        }
      });

      // /admin command handler
      bot.command("admin", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) {
          return ctx.reply("Ошибка: не удалось определить ваш Telegram ID");
        }

        try {
          // Check if user is admin
          const adminTgIds = config.adminTgIds.map(id => parseInt(id));
          if (!adminTgIds.includes(tgId)) {
            return ctx.reply("У вас нет доступа к админ-панели");
          }

          // Generate login link
          const loginLink = await generateAdminLoginLink(tgId);
          
          await ctx.reply(
            `🔐 Ваша ссылка для входа в админ-панель:\n\n${loginLink}\n\n` +
            `⚠️ Ссылка действительна 1 час и может быть использована только один раз.`
          );
          
          logger.info({ tgId }, 'Admin login link generated');
        } catch (err) {
          logger.error({ err, tgId }, "Failed to generate admin login link");
          await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
        }
      });

      // Text message handler
      bot.on("message:text", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) return;
        const from = ctx.from!;

        try {
          // Save contact
          await upsertBotContact({ 
            tgId, 
            botLink,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
          });

          // Handle with AI agent
          await handleTextMessage(ctx, { botLink });
        } catch (err) {
          logger.error({ err, tgId, botLink }, "Failed to handle text message");
        }
      });

      // Voice message handler
      bot.on("message:voice", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) return;
        const from = ctx.from!;

        try {
          // Save contact
          await upsertBotContact({ 
            tgId, 
            botLink,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
          });

          // Handle with AI agent + STT
          await handleVoiceMessage(ctx, { botLink });
        } catch (err) {
          logger.error({ err, tgId, botLink }, "Failed to handle voice message");
        }
      });

      // Start polling
      bot.start({
        drop_pending_updates: config.dropPendingUpdates,
      });

      activeBots.push({
        bot,
        token: botConfig.token,
        botLink,
        id: botConfig.id,
      });

      logger.info(`[Bot ${botConfig.id}] Polling started for ${botLink}`);
    } catch (err) {
      logger.error(
        { err },
        `[Bot ${botConfig.id}] Failed to start (token: ${tokenPreview})`
      );
    }
  }

  const started = activeBots.length;
  logger.info({ started, total: botConfigs.length }, 'All bots processed');
}
