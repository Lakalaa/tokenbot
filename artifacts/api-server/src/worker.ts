import { createBot } from "./bot/index.js";
import { logger } from "./lib/logger.js";
import type { Bot } from "grammy";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

let botInstance: Bot | null = null;
let restartTimer: NodeJS.Timeout | null = null;

async function startPolling(bot: Bot) {
  while (true) {
    try {
      await bot.start({
        allowed_updates: ["message"],
        onStart: (info) => {
          logger.info({ username: info.username }, "Bot polling started");
        },
      });
      break;
    } catch (err: any) {
      if (err?.error_code === 409) {
        logger.warn({ error_code: err.error_code }, "409 conflict — retrying in 20s");
        await sleep(20_000);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  logger.info("Starting Telegram bot worker...");

  const bot = createBot();
  botInstance = bot;

  // Intercept any 409 that escapes startPolling (grammY internal unhandled rejection)
  process.on("unhandledRejection", (reason: any) => {
    if (reason?.error_code === 409) {
      logger.warn("409 via unhandledRejection — will retry in 20s");
      if (!restartTimer) {
        restartTimer = setTimeout(async () => {
          restartTimer = null;
          try {
            await startPolling(bot);
          } catch (e) {
            logger.error({ err: e }, "Bot failed after 409 retry");
            process.exit(1);
          }
        }, 20_000);
      }
      return;
    }
    logger.error({ reason }, "Unhandled rejection");
    process.exit(1);
  });

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  await bot.api.setMyCommands(
    [{ command: "start", description: "Start" }],
    { scope: { type: "default" } },
  );

  await bot.api.setMyCommands(
    [
      { command: "help",         description: "Show all admin commands" },
      { command: "newstake",     description: "Post stake alert — /newstake 500000 180" },
      { command: "setupstake",   description: "Configure token, supply, links" },
      { command: "setbanner",    description: "Reply to image to set stake banner" },
      { command: "setstakelink", description: "Set Stake button link — /setstakelink https://..." },
      { command: "setemoji",     description: "Set stake emoji — /setemoji 🔥" },
      { command: "setupbuy",     description: "Start buy alerts — /setupbuy contract:0x... chain:ethereum" },
      { command: "setlink",      description: "Add button link — /setlink Text https://url" },
      { command: "setannounce",  description: "Recurring message — /setannounce 30 text" },
    ],
    { scope: { type: "all_chat_administrators" } },
  );

  logger.info("Bot commands registered");

  // Wait for old instance to fully stop after SIGTERM before polling
  logger.info("Waiting 10s for previous instance to clear...");
  await sleep(10_000);

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM — stopping bot");
    if (restartTimer) clearTimeout(restartTimer);
    await bot.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT — stopping bot");
    if (restartTimer) clearTimeout(restartTimer);
    await bot.stop();
    process.exit(0);
  });

  await startPolling(bot);
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
