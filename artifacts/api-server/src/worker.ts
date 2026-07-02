import { createBot } from "./bot/index.js";
import { logger } from "./lib/logger.js";
import type { Bot } from "grammy";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function startPolling(bot: Bot) {
  while (true) {
    try {
      await bot.start({
        allowed_updates: ["message"],
        onStart: (info) => {
          logger.info({ username: info.username }, "Bot polling started");
        },
      });
      break; // clean stop via bot.stop()
    } catch (err: any) {
      if (err?.error_code === 409) {
        logger.warn("409 conflict — old instance still running, retrying in 15s...");
        await sleep(15_000);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  logger.info("Starting Telegram bot worker...");

  const bot = createBot();

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  // Register command menu so users see options when they type /
  // Minimal public menu
  await bot.api.setMyCommands(
    [{ command: "start", description: "Start" }],
    { scope: { type: "default" } },
  );

  // Admin menu — only visible to group admins
  await bot.api.setMyCommands(
    [
      { command: "help",        description: "Show all admin commands" },
      { command: "newstake",    description: "Post stake alert — /newstake 500000 180" },
      { command: "setupstake",  description: "Configure token, supply, links" },
      { command: "setbanner",   description: "Reply to image to set stake banner" },
      { command: "setstakelink", description: "Set Stake button link — /setstakelink https://..." },
      { command: "setemoji",    description: "Set stake emoji — /setemoji 🔥" },
      { command: "setupbuy",    description: "Start buy alerts — /setupbuy contract:0x... chain:ethereum" },
      { command: "setlink",     description: "Add button link — /setlink Text https://url" },
      { command: "setannounce", description: "Recurring message — /setannounce 30 text" },
    ],
    { scope: { type: "all_chat_administrators" } },
  );

  logger.info("Bot commands registered");

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

  await startPolling(bot);
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
