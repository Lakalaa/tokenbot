import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
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
  stakeEmoji?: string;
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

function buildStakeButtons(config: StakeConfig | null, symbol: string) {
  const rows: Array<Array<{ text: string; url: string }>> = [];
  const row: Array<{ text: string; url: string }> = [];
  if (config?.explorerUrl) row.push({ text: "🔍 View on Explorer", url: config.explorerUrl });
  if (config?.stakeUrl)    row.push({ text: `Stake $${symbol} →`, url: config.stakeUrl });
  if (row.length) rows.push(row);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

// Caption for photo mode (plain text, 1024 char limit)
function buildCaption(amount: number, symbol: string, lockDays: number, config: StakeConfig | null): string {
  const emoji = config?.stakeEmoji ?? "🤖";
  const commaAmount = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const count = Math.min(25, Math.max(5, Math.floor(amount / 10_000)));
  const row = emoji.repeat(count);

  const lockLine = lockDays > 0
    ? `${commaAmount} $${symbol} · ${lockDays}d lock`
    : `${commaAmount} $${symbol} staked`;

  const lines = [`🔒 NEW STAKE 🔒`, ``, row, ``, lockLine];

  if (config?.totalStaked) {
    const totalFmt = config.totalStaked.toLocaleString("en-US", { maximumFractionDigits: 2 });
    lines.push(`Total staked: ${totalFmt} $${symbol}`);
    if (config.totalSupply > 0) {
      const pct = ((config.totalStaked / config.totalSupply) * 100).toFixed(1);
      lines.push(`${pct}% of supply locked`);
    }
  }

  return lines.join("\n");
}

// Rich HTML for text-only mode
export function formatStakeAlert(
  amount: number,
  symbol: string,
  lockDays: number,
  config: StakeConfig | null,
  _autoDetected = false,
): string {
  const emoji = config?.stakeEmoji ?? "🤖";
  const commaAmount = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const count = Math.min(25, Math.max(5, Math.floor(amount / 10_000)));
  const row = emoji.repeat(count);

  const lockLine = lockDays > 0
    ? `<b>${commaAmount} $${symbol}</b> · ${lockDays}d lock`
    : `<b>${commaAmount} $${symbol}</b> staked`;

  const lines = [`🔒 <b>NEW STAKE</b> 🔒`, ``, row, ``, lockLine];

  if (config?.totalStaked) {
    const totalFmt = config.totalStaked.toLocaleString("en-US", { maximumFractionDigits: 2 });
    lines.push(`Total staked: <b>${totalFmt} $${symbol}</b>`);
    if (config.totalSupply > 0) {
      const pct = ((config.totalStaked / config.totalSupply) * 100).toFixed(1);
      lines.push(`<b>${pct}%</b> of supply locked`);
    }
  }

  return lines.join("\n");
}

// Main sender — photo+caption+buttons if banner set, else text+buttons
export async function sendStakeAlert(
  api: Api,
  chatId: number,
  amount: number,
  lockDays: number,
  config: StakeConfig | null,
): Promise<void> {
  const symbol = config?.symbol ?? "TOKEN";
  const buttons = buildStakeButtons(config, symbol);

  if (config?.bannerUrl) {
    const caption = buildCaption(amount, symbol, lockDays, config);
    try {
      await api.sendPhoto(chatId, config.bannerUrl, {
        caption,
        reply_markup: buttons,
      });
      return;
    } catch (err) {
      logger.warn({ err, chatId }, "Banner photo send failed, falling back to text");
    }
  }

  const text = formatStakeAlert(amount, symbol, lockDays, config);
  await api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: buttons,
  });
}
