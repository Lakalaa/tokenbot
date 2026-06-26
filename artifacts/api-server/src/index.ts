import { webhookCallback } from "grammy";
import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot/index";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (process.env["BOT_DISABLED"] === "true") {
    logger.info("BOT_DISABLED=true — bot will not start on this instance");
    return;
  }

  const bot = createBot();
  const webhookUrl = process.env["WEBHOOK_URL"];

  if (webhookUrl) {
    const path = "/bot/webhook";
    app.post(path, webhookCallback(bot, "express"));
    await bot.api.setWebhook(`${webhookUrl}${path}`, {
      drop_pending_updates: true,
    });
    logger.info({ url: `${webhookUrl}${path}` }, "Telegram bot started (webhook)");
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    bot.start({
      allowed_updates: ["message"],
      onStart: (info) => {
        logger.info({ username: info.username }, "Telegram bot started (polling)");
      },
    });
  }
});
