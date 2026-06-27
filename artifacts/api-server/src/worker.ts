import { createBot } from "./bot/index.js";
import { logger } from "./lib/logger.js";

async function main() {
  logger.info("Starting Telegram bot worker...");

  const bot = createBot();

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  bot.start({
    allowed_updates: ["message"],
    onStart: (info) => {
      logger.info({ username: info.username }, "Bot polling started");
    },
  });

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM — stopping bot");
    await bot.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT — stopping bot");
    await bot.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
