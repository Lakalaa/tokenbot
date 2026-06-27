import { Bot, Context, GrammyError, HttpError } from "grammy";
import { logger } from "../lib/logger.js";
import { lookupToken } from "./dexscreener.js";
import { e } from "./emoji.js";
import { formatTokenMessage, formatStartMessage, formatHelpMessage } from "./formatter.js";
import { loadLinks, getLinks, addLink, removeLink, clearLinks } from "./links.js";
import { initScheduler, setAnnouncement, getAnnouncement, stopAnnouncement } from "./scheduler.js";
import {
  loadStakeConfig,
  getAllStakeConfigs,
  getStakeConfig,
  setStakeConfig,
  addStakeAmount,
  formatStakeAlert,
} from "./stakeConfig.js";
import {
  initChainMonitor,
  restoreMonitors,
  startMonitoring,
  stopMonitoring,
  isMonitoring,
  CHAIN_RPCS,
} from "./chainMonitor.js";
import {
  loadBuyConfig,
  getAllBuyConfigs,
  getBuyConfig,
  setBuyConfig,
  deleteBuyConfig,
} from "./buyConfig.js";
import {
  initBuyMonitor,
  restoreBuyMonitors,
  startBuyMonitoring,
  stopBuyMonitoring,
  isBuyMonitoring,
} from "./buyMonitor.js";

const ETH_ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const SOL_ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

function extractAddress(text: string): string | null {
  const eth = text.match(ETH_ADDRESS_RE);
  if (eth) return eth[0];
  const words = text.trim().split(/\s+/);
  for (const word of words) {
    if (SOL_ADDRESS_RE.test(word) && word.length >= 32 && word.length <= 44) return word;
  }
  return null;
}

async function isAdmin(ctx: Context, userId: number): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat) return false;
  if (chat.type === "private") return true;
  try {
    const member = await ctx.api.getChatMember(chat.id, userId);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

function parseKV(args: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+):(https?:\/\/\S+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) {
    out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

export function createBot(): Bot {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot will not start");
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  loadLinks();
  loadStakeConfig();
  loadBuyConfig();

  const bot = new Bot(token);

  initScheduler(bot.api);
  initChainMonitor(bot.api);
  initBuyMonitor(bot.api);

  const saved = getAllStakeConfigs().filter((c) => c.config.monitor);
  if (saved.length > 0) {
    restoreMonitors(saved.map((c) => ({ chatId: c.chatId, monitor: c.config.monitor! })));
  }

  const savedBuys = getAllBuyConfigs().filter((c) => c.config.monitor);
  if (savedBuys.length > 0) {
    restoreBuyMonitors(savedBuys.map((c) => ({ chatId: c.chatId, monitor: c.config.monitor! })));
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(formatStartMessage(), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(formatHelpMessage(), { parse_mode: "HTML" });
  });

  bot.command("setlink", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only group admins can set custom links.`, { parse_mode: "HTML" });
      return;
    }
    const args = ctx.match?.trim() ?? "";
    const match = args.match(/^(.+?)\s+(https?:\/\/\S+)$/);
    if (!match) {
      await ctx.reply(
        `${e("info")} <b>Usage:</b> <code>/setlink Text https://your-url.com</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const [, text, url] = match;
    addLink(ctx.chat!.id, text.trim(), url.trim());
    await ctx.reply(
      `${e("greenCircle")} Link added: <a href="${url.trim()}">${text.trim()}</a>`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("listlinks", async (ctx) => {
    const links = getLinks(ctx.chat!.id);
    if (links.length === 0) {
      await ctx.reply(`${e("info")} No custom links set. Use /setlink to add one.`, { parse_mode: "HTML" });
      return;
    }
    const list = links.map((l, i) => `${i + 1}. <a href="${l.url}">${l.text}</a>`).join("\n");
    await ctx.reply(`${e("link")} <b>Custom links:</b>\n\n${list}\n\nRemove: <code>/removelink 1</code>`, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("removelink", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can remove links.`, { parse_mode: "HTML" });
      return;
    }
    const index = parseInt(ctx.match?.trim() ?? "", 10) - 1;
    if (isNaN(index)) {
      await ctx.reply(`${e("info")} Usage: <code>/removelink 1</code>`, { parse_mode: "HTML" });
      return;
    }
    const removed = removeLink(ctx.chat!.id, index);
    await ctx.reply(removed ? `${e("greenCircle")} Link removed.` : `${e("warning")} Link not found.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("clearlinks", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can clear links.`, { parse_mode: "HTML" });
      return;
    }
    clearLinks(ctx.chat!.id);
    await ctx.reply(`${e("greenCircle")} All custom links cleared.`, { parse_mode: "HTML" });
  });

  bot.command("setannounce", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can set announcements.`, { parse_mode: "HTML" });
      return;
    }
    const args = ctx.match?.trim() ?? "";
    const match = args.match(/^(\d+)\s+(.+)$/s);
    if (!match) {
      await ctx.reply(
        `${e("info")} <b>Usage:</b> <code>/setannounce &lt;minutes&gt; &lt;message&gt;</code>\n\nExample:\n<code>/setannounce 30 🚀 Welcome! Check our token here.</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const minutes = parseInt(match[1], 10);
    if (minutes < 1) {
      await ctx.reply(`${e("warning")} Minimum interval is 1 minute.`, { parse_mode: "HTML" });
      return;
    }
    setAnnouncement(ctx.chat!.id, minutes, match[2].trim());
    await ctx.reply(
      `${e("greenCircle")} Recurring message set — every <b>${minutes} min</b>.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("stopannounce", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can stop announcements.`, { parse_mode: "HTML" });
      return;
    }
    const stopped = stopAnnouncement(ctx.chat!.id);
    await ctx.reply(
      stopped ? `${e("greenCircle")} Recurring message stopped.` : `${e("info")} No active announcement.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("showannounce", async (ctx) => {
    const rec = getAnnouncement(ctx.chat!.id);
    if (!rec) {
      await ctx.reply(`${e("info")} No recurring message set.`, { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(
      `${e("lightning")} <b>Active — every ${rec.intervalMinutes} min:</b>\n\n${rec.text}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("setupstake", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can configure staking.`, { parse_mode: "HTML" });
      return;
    }
    const args = ctx.match?.trim() ?? "";
    if (!args) {
      const chains = Object.keys(CHAIN_RPCS).join(" | ");
      await ctx.reply(
        [
          `${e("info")} <b>Stake Setup Guide</b>`,
          ``,
          `<b>Step 1 — Basic info:</b>`,
          `<code>/setupstake symbol:AR supply:1000000000 stakeurl:https://stake.ar.io explorerurl:https://solscan.io/token/...</code>`,
          ``,
          `<b>Step 2 — Auto-detect stakes on-chain (optional):</b>`,
          `<code>/setupstake chain:ethereum stakingcontract:0x... tokencontract:0x... decimals:18</code>`,
          ``,
          `Supported chains: <code>${chains}</code>`,
          ``,
          `Once chain monitoring is set, the bot watches the blockchain every 30s and posts alerts automatically — no commands needed.`,
          ``,
          `Use /stopmonitor to disable auto-detection.`,
        ].join("\n"),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
      return;
    }

    const kv = parseKV(args);
    const chatId = ctx.chat!.id;
    const stakeUpdate: Parameters<typeof setStakeConfig>[1] = {};

    if (kv["symbol"]) stakeUpdate.symbol = kv["symbol"];
    if (kv["supply"]) stakeUpdate.totalSupply = parseFloat(kv["supply"].replace(/,/g, ""));
    if (kv["totalstaked"]) stakeUpdate.totalStaked = parseFloat(kv["totalstaked"].replace(/,/g, ""));
    if (kv["stakeurl"]) stakeUpdate.stakeUrl = kv["stakeurl"];
    if (kv["explorerurl"]) stakeUpdate.explorerUrl = kv["explorerurl"];

    if (kv["chain"] || kv["stakingcontract"] || kv["tokencontract"]) {
      const existing = getStakeConfig(chatId);
      const chain = kv["chain"] ?? existing?.monitor?.chain ?? "";
      const stakingContract = kv["stakingcontract"] ?? existing?.monitor?.stakingContract ?? "";
      const tokenContract = kv["tokencontract"] ?? existing?.monitor?.tokenContract ?? "";

      if (!chain || !stakingContract || !tokenContract) {
        await ctx.reply(
          `${e("warning")} To enable auto-detection, provide all three:\n<code>chain:</code> <code>stakingcontract:</code> <code>tokencontract:</code>`,
          { parse_mode: "HTML" },
        );
        return;
      }
      if (!CHAIN_RPCS[chain]) {
        const chains = Object.keys(CHAIN_RPCS).join(", ");
        await ctx.reply(
          `${e("warning")} Unknown chain <b>${chain}</b>. Supported: ${chains}`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const symbol = kv["symbol"] ?? existing?.symbol ?? "TOKEN";
      const decimals = kv["decimals"] ? parseInt(kv["decimals"], 10) : 18;
      const minAlert = kv["minalert"] ? parseFloat(kv["minalert"]) : 0;

      stakeUpdate.monitor = { chain, stakingContract, tokenContract, symbol, decimals, minAlert };
    }

    const saved = setStakeConfig(chatId, stakeUpdate);

    if (saved.monitor) {
      startMonitoring(chatId, saved.monitor);
    }

    const monitoring = isMonitoring(chatId);
    const lines = [
      `${e("greenCircle")} <b>Stake config updated</b>`,
      saved.symbol ? `${e("gem")} Token: <b>$${saved.symbol}</b>` : "",
      saved.totalSupply ? `Supply: ${saved.totalSupply.toLocaleString("en-US")}` : "",
      saved.stakeUrl ? `Stake link: ${saved.stakeUrl}` : "",
      saved.explorerUrl ? `Explorer: ${saved.explorerUrl}` : "",
      saved.monitor ? `${e("lightning")} <b>Auto-monitoring: ${saved.monitor.chain.toUpperCase()} — active every 30s</b>` : "",
      !monitoring && !saved.monitor ? `\nUse /setupstake with chain+contracts to enable auto stake alerts.` : "",
    ].filter(Boolean);

    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("stopmonitor", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can stop monitoring.`, { parse_mode: "HTML" });
      return;
    }
    const chatId = ctx.chat!.id;
    if (!isMonitoring(chatId)) {
      await ctx.reply(`${e("info")} No active monitor running.`, { parse_mode: "HTML" });
      return;
    }
    stopMonitoring(chatId);
    const cfg = getStakeConfig(chatId);
    if (cfg) {
      delete cfg.monitor;
      setStakeConfig(chatId, cfg);
    }
    await ctx.reply(`${e("greenCircle")} Auto stake monitoring stopped.`, { parse_mode: "HTML" });
  });

  bot.command("stakestatus", async (ctx) => {
    const chatId = ctx.chat!.id;
    const cfg = getStakeConfig(chatId);
    if (!cfg) {
      await ctx.reply(`${e("info")} No stake config set. Use /setupstake to configure.`, { parse_mode: "HTML" });
      return;
    }
    const active = isMonitoring(chatId);
    await ctx.reply(
      [
        `${e("chart")} <b>Stake Status</b>`,
        cfg.symbol ? `Token: <b>$${cfg.symbol}</b>` : "",
        cfg.totalStaked ? `Total staked: ${cfg.totalStaked.toLocaleString("en-US")}` : "",
        cfg.totalSupply ? `Supply: ${cfg.totalSupply.toLocaleString("en-US")}` : "",
        cfg.monitor ? `Chain: <b>${cfg.monitor.chain.toUpperCase()}</b>` : "",
        cfg.monitor ? `Staking contract: <code>${cfg.monitor.stakingContract}</code>` : "",
        `Auto-monitor: ${active ? `${e("greenCircle")} <b>Active</b>` : `${e("redCircle")} Off`}`,
      ].filter(Boolean).join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("newstake", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can post stake alerts.`, { parse_mode: "HTML" });
      return;
    }
    const args = ctx.match?.trim() ?? "";
    const match = args.match(/^([\d,]+(?:\.\d+)?)\s+(\d+)$/);
    if (!match) {
      await ctx.reply(
        `${e("info")} <b>Usage:</b> <code>/newstake &lt;amount&gt; &lt;lock_days&gt;</code>\n\nExample: <code>/newstake 500000 180</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const amount = parseFloat(match[1].replace(/,/g, ""));
    const lockDays = parseInt(match[2], 10);
    const chatId = ctx.chat!.id;
    const config = getStakeConfig(chatId);
    if (!config?.symbol) {
      await ctx.reply(
        `${e("warning")} Token not configured. Run /setupstake first.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const updated = addStakeAmount(chatId, amount) ?? config;
    const msg = formatStakeAlert(amount, config.symbol.toUpperCase(), lockDays, updated);
    await ctx.reply(msg, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("setupbuy", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can configure buy alerts.`, { parse_mode: "HTML" });
      return;
    }
    const args = ctx.match?.trim() ?? "";
    if (!args) {
      const chains = Object.keys(CHAIN_RPCS).join(" | ");
      await ctx.reply(
        [
          `${e("fire")} <b>Buy Alert Setup</b>`,
          ``,
          `<b>Usage:</b>`,
          `<code>/setupbuy contract:0x... chain:ethereum</code>`,
          ``,
          `<b>Optional params:</b>`,
          `  <code>minusd:50</code> — minimum USD to alert (default 10)`,
          `  <code>charturl:https://...</code>`,
          `  <code>buyurl:https://...</code>`,
          `  <code>website:https://...</code>`,
          ``,
          `Supported chains: <code>${chains}</code>`,
          ``,
          `The bot fetches the pair address automatically from DexScreener.`,
          `Stop with /stopbuy.`,
        ].join("\n"),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
      return;
    }

    const kv = parseKV(args);
    const contract = kv["contract"];
    const chain = kv["chain"];

    if (!contract || !chain) {
      await ctx.reply(
        `${e("warning")} Provide both <code>contract:</code> and <code>chain:</code>\n\nExample:\n<code>/setupbuy contract:0xABC chain:ethereum</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    if (!CHAIN_RPCS[chain]) {
      await ctx.reply(
        `${e("warning")} Unknown chain <b>${chain}</b>. Supported: ${Object.keys(CHAIN_RPCS).join(", ")}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.replyWithChatAction("typing");

    let pairs: Awaited<ReturnType<typeof lookupToken>>;
    try {
      pairs = await lookupToken(contract);
    } catch {
      await ctx.reply(`${e("warning")} Failed to reach DexScreener. Check the contract address and try again.`, { parse_mode: "HTML" });
      return;
    }

    if (!pairs || pairs.length === 0) {
      await ctx.reply(`${e("warning")} No token found for <code>${contract}</code> on DexScreener.`, { parse_mode: "HTML" });
      return;
    }

    const pair = pairs.find((p) => p.chainId === chain) ?? pairs[0];
    const chatId = ctx.chat!.id;

    const monitor = {
      chain,
      tokenContract: contract,
      pairAddress: pair.pairAddress,
      symbol: pair.baseToken.symbol,
      decimals: 18,
      minUsd: kv["minusd"] ? parseFloat(kv["minusd"]) : 10,
      chartUrl: kv["charturl"],
      buyUrl: kv["buyurl"],
      websiteUrl: kv["website"],
    };

    setBuyConfig(chatId, { monitor });
    startBuyMonitoring(chatId, monitor);

    await ctx.reply(
      [
        `${e("fire")} <b>Buy alerts enabled!</b>`,
        ``,
        `${e("gem")} Token: <b>$${monitor.symbol}</b>`,
        `${e("globe")} Chain: <b>${chain.toUpperCase()}</b>`,
        `${e("link")} Pair: <code>${pair.pairAddress}</code>`,
        `${e("lightning")} Min alert: <b>$${monitor.minUsd}</b>`,
        ``,
        `The bot watches on-chain every 30s and posts here when a buy happens.`,
        `Stop with /stopbuy.`,
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("stopbuy", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !(await isAdmin(ctx, userId))) {
      await ctx.reply(`${e("warning")} Only admins can stop buy alerts.`, { parse_mode: "HTML" });
      return;
    }
    const chatId = ctx.chat!.id;
    if (!isBuyMonitoring(chatId)) {
      await ctx.reply(`${e("info")} No buy alerts are running.`, { parse_mode: "HTML" });
      return;
    }
    stopBuyMonitoring(chatId);
    deleteBuyConfig(chatId);
    await ctx.reply(`${e("greenCircle")} Buy alerts stopped.`, { parse_mode: "HTML" });
  });

  bot.command("buystatus", async (ctx) => {
    const chatId = ctx.chat!.id;
    const cfg = getBuyConfig(chatId);
    const active = isBuyMonitoring(chatId);
    if (!cfg?.monitor) {
      await ctx.reply(`${e("info")} No buy alert configured. Use /setupbuy to set one up.`, { parse_mode: "HTML" });
      return;
    }
    const m = cfg.monitor;
    await ctx.reply(
      [
        `${e("fire")} <b>Buy Alert Status</b>`,
        ``,
        `Token: <b>$${m.symbol}</b>`,
        `Chain: <b>${m.chain.toUpperCase()}</b>`,
        `Contract: <code>${m.tokenContract}</code>`,
        `Pair: <code>${m.pairAddress}</code>`,
        `Min USD: <b>$${m.minUsd}</b>`,
        `Status: ${active ? `${e("greenCircle")} <b>Active</b>` : `${e("redCircle")} Stopped`}`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const chatType = ctx.chat.type;
    const isGroup = chatType === "group" || chatType === "supergroup";

    if (isGroup) {
      const botInfo = await bot.api.getMe();
      const mentioned = text.includes(`@${botInfo.username}`);
      const words = text.trim().split(/\s+/);
      const hasAddress =
        ETH_ADDRESS_RE.test(text) ||
        words.some((w) => SOL_ADDRESS_RE.test(w) && w.length >= 32 && w.length <= 44);
      if (!mentioned && !hasAddress) return;
    }

    const address = extractAddress(text);
    if (!address) {
      if (!isGroup) {
        await ctx.reply(
          `${e("warning")} Couldn't detect a valid token address.\n\nPaste a contract address like:\n<code>0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2</code>`,
          { parse_mode: "HTML" },
        );
      }
      return;
    }

    await ctx.replyWithChatAction("typing");

    let pairs: Awaited<ReturnType<typeof lookupToken>>;
    try {
      pairs = await lookupToken(address);
    } catch (err) {
      logger.error({ err, address }, "DexScreener lookup failed");
      await ctx.reply("❌ Failed to reach DexScreener. Please try again.");
      return;
    }

    if (!pairs || pairs.length === 0) {
      await ctx.reply(
        `❌ No token found for:\n<code>${address}</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const links = getLinks(ctx.chat.id);
    const msg = formatTokenMessage(pairs, links);
    await ctx.reply(msg, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({ update: ctx.update.update_id }, "Bot error");
    if (err.error instanceof GrammyError) {
      logger.error({ description: err.error.description }, "Telegram API error");
    } else if (err.error instanceof HttpError) {
      logger.error({ err: err.error }, "HTTP error reaching Telegram");
    } else {
      logger.error({ err: err.error }, "Unknown bot error");
    }
  });

  return bot;
}
