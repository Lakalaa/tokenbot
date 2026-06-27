import { createBot } from "./bot/index.js";
import { logger } from "./lib/logger.js";

async function main() {
  logger.info("Starting Telegram bot worker...");

  const bot = createBot();

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  // Register command menu so users see options when they type /
  await bot.api.setMyCommands(
    [
      { command: "start", description: "Welcome message" },
      { command: "help", description: "Show all commands" },
    ],
    { scope: { type: "all_private_chats" } },
  );

  await bot.api.setMyCommands(
    [
      { command: "help", description: "Show all commands" },
      { command: "newstake", description: "Post a new stake alert — /newstake 500000 180" },
      { command: "stakestatus", description: "Show stake config & monitor status" },
      { command: "setbanner", description: "Set stake alert banner (reply to an image)" },
      { command: "removebanner", description: "Remove stake alert banner" },
      { command: "setupstake", description: "Configure staking alerts" },
      { command: "stopmonitor", description: "Stop on-chain stake monitoring" },
      { command: "setupbuy", description: "Configure buy alerts" },
      { command: "stopbuy", description: "Stop buy alerts" },
      { command: "buystatus", description: "Show buy alert status" },
      { command: "setlink", description: "Add a custom link — /setlink Text https://url" },
      { command: "listlinks", description: "List custom links" },
      { command: "removelink", description: "Remove a link — /removelink 1" },
      { command: "clearlinks", description: "Remove all custom links" },
      { command: "setannounce", description: "Recurring message — /setannounce 30 Your text" },
      { command: "showannounce", description: "Show active announcement" },
      { command: "stopannounce", description: "Stop recurring announcement" },
    ],
    { scope: { type: "all_chat_administrators" } },
  );

  logger.info("Bot commands registered");

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
