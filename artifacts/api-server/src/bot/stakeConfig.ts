import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
import { e } from "./emoji.js";
import type { Api } from "grammy";

const DATA_DIR = join(process.cwd(), "bot-data");
const FILE = join(DATA_DIR, "stake-config.json");

export interface StakeMonitorConfig {
  chain: string;
  stakingContract: string;
  tokenContract: string;
  symbol: string;
  decimals?: number;
  minAlert?: number;
}

export interface StakeConfig {
  totalStaked: number;
  totalSupply: number;
  symbol: string;
  explorerUrl?: string;
  stakeUrl?: string;
  bannerUrl?: string;
  monitor?: StakeMonitorConfig;
}

let store: Record<string, StakeConfig> = {};

export function loadStakeConfig(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(FILE)) store = JSON.parse(readFileSync(FILE, "utf8"));
  } catch (err) {
    logger.warn({ err }, "Failed to load stake config");
    store = {};
  }
}

export function getAllStakeConfigs(): Array<{ chatId: number; config: StakeConfig }> {
  return Object.entries(store).map(([k, v]) => ({ chatId: Number(k), config: v }));
}

function save(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to save stake config");
  }
}

export function getStakeConfig(chatId: number): StakeConfig | null {
  return store[String(chatId)] ?? null;
}

export function setStakeConfig(chatId: number, config: Partial<StakeConfig>): StakeConfig {
  const key = String(chatId);
  store[key] = { ...store[key], ...config } as StakeConfig;
  save();
  return store[key];
}

export function addStakeAmount(chatId: number, amount: number): StakeConfig | null {
  const key = String(chatId);
  if (!store[key]) return null;
  store[key].totalStaked = (store[key].totalStaked ?? 0) + amount;
  save();
  return store[key];
}

// Plain-text version (no HTML tags) used for photo captions (1024 char limit)
function buildCaption(
  amount: number,
  symbol: string,
  lockDays: number,
  config: StakeConfig | null,
): string {
  const commaAmount = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const robotCount = Math.min(25, Math.max(5, Math.floor(amount / 10_000)));
  const robots = "🤖".repeat(robotCount);

  const lockLine = lockDays > 0
    ? `${commaAmount} $${symbol} · ${lockDays}d lock`
    : `${commaAmount} $${symbol} staked`;

  const lines: string[] = [
    `🔒 NEW STAKE 🔒`,
    ``,
    robots,
    ``,
    lockLine,
  ];

  if (config?.totalStaked) {
    const totalFmt = config.totalStaked.toLocaleString("en-US", { maximumFractionDigits: 2 });
    lines.push(`Total staked: ${totalFmt} $${symbol}`);
    if (config.totalSupply > 0) {
      const pct = ((config.totalStaked / config.totalSupply) * 100).toFixed(1);
      lines.push(`${pct}% of supply locked`);
    }
  }

  const linkParts: string[] = [];
  if (config?.explorerUrl) linkParts.push(`View on Explorer`);
  if (config?.stakeUrl) linkParts.push(`Stake $${symbol} →`);
  if (linkParts.length > 0) lines.push(``, linkParts.join(" · "));

  return lines.join("\n");
}

// Rich HTML version used when there is no banner image (sendMessage, 4096 char limit)
export function formatStakeAlert(
  amount: number,
  symbol: string,
  lockDays: number,
  config: StakeConfig | null,
  _autoDetected = false,
): string {
  const commaAmount = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const robotCount = Math.min(25, Math.max(5, Math.floor(amount / 10_000)));
  const robots = Array(robotCount).fill(e("robot")).join("");

  const lockLine = lockDays > 0
    ? `${e("boom")} <b>${commaAmount} $${symbol}</b> · ${lockDays}d lock`
    : `${e("boom")} <b>${commaAmount} $${symbol}</b> staked`;

  const lines: string[] = [
    `${e("lock")} <b>NEW STAKE</b> ${e("lock")}`,
    ``,
    robots,
    ``,
    lockLine,
  ];

  if (config?.totalStaked) {
    const totalFmt = config.totalStaked.toLocaleString("en-US", { maximumFractionDigits: 2 });
    lines.push(`${e("gem")} Total staked: <b>${totalFmt} $${symbol}</b>`);
    if (config.totalSupply > 0) {
      const pct = ((config.totalStaked / config.totalSupply) * 100).toFixed(1);
      lines.push(`${e("crown")} <b>${pct}%</b> of supply locked`);
    }
  }

  const linkParts: string[] = [];
  if (config?.explorerUrl) linkParts.push(`<a href="${config.explorerUrl}">View on Explorer</a>`);
  if (config?.stakeUrl) linkParts.push(`<a href="${config.stakeUrl}">Stake $${symbol} →</a>`);
  if (linkParts.length > 0) lines.push(``, `${e("rocket")} ${linkParts.join("  ·  ")}`);

  return lines.join("\n");
}

// Unified sender — uses photo+caption if bannerUrl is set, otherwise sends text
export async function sendStakeAlert(
  api: Api,
  chatId: number,
  amount: number,
  lockDays: number,
  config: StakeConfig | null,
): Promise<void> {
  const symbol = config?.symbol ?? "TOKEN";

  if (config?.bannerUrl) {
    const caption = buildCaption(amount, symbol, lockDays, config);
    // Build inline keyboard with links
    const buttons: Array<Array<{ text: string; url: string }>> = [];
    const row: Array<{ text: string; url: string }> = [];
    if (config.explorerUrl) row.push({ text: "🔍 View on Explorer", url: config.explorerUrl });
    if (config.stakeUrl) row.push({ text: `Stake $${symbol} →`, url: config.stakeUrl });
    if (row.length > 0) buttons.push(row);

    try {
      await api.sendPhoto(chatId, config.bannerUrl, {
        caption,
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
      });
      return;
    } catch (err) {
      logger.warn({ err, chatId }, "Failed to send stake banner photo, falling back to text");
    }
  }

  // Fallback: rich HTML text message
  const msg = formatStakeAlert(amount, symbol, lockDays, config);
  await api.sendMessage(chatId, msg, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}
