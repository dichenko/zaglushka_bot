import { Bot } from "grammy";
import { config, logger } from "./config.js";
import { upsertBotContact } from "./db.js";

interface BotInfo {
  bot: Bot;
  token: string;
  botLink: string;
}

export async function startBots(): Promise<void> {
  const tokens = config.botTokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenPreview =
      token.length > 20 ? token.slice(0, 10) + "..." + token.slice(-6) : token;

    try {
      const bot = new Bot(token);

      await bot.api.deleteWebhook();
      logger.info(`[Bot ${i + 1}/${tokens.length}] Webhook deleted`);

      if (config.dropPendingUpdates) {
        await bot.api.getUpdates({
          offset: -1,
          timeout: 1,
        });
        logger.info(`[Bot ${i + 1}/${tokens.length}] Pending updates dropped`);
      }

      const me = await bot.api.getMe();
      const botLink = `https://t.me/${me.username}`;
      logger.info(
        `[Bot ${i + 1}/${tokens.length}] @${me.username} ready (token: ${tokenPreview})`
      );

      bot.on("message", async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) return;

        try {
          await upsertBotContact({ tgId, botLink });
        } catch (err) {
          logger.error({ err, tgId, botLink }, "Failed to upsert contact");
        }

        try {
          await ctx.reply(config.autoReplyMessage);
        } catch (err) {
          logger.error({ err, tgId, botLink }, "Failed to send reply");
        }
      });

      bot.start({
        drop_pending_updates: config.dropPendingUpdates,
      });

      logger.info(
        `[Bot ${i + 1}/${tokens.length}] Polling started for ${botLink}`
      );
    } catch (err) {
      logger.error(
        { err },
        `[Bot ${i + 1}/${tokens.length}] Failed to start (token: ${tokenPreview})`
      );
    }
  }

  const started = tokens.length;
  logger.info(`All ${started} bots processed`);
}
