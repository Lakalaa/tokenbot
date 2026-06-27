import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
import { e } from "./emoji.js";

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
  monitor?: StakeMonitorConfig;
}

let store: Record<string, StakeConfig> = {};

export function loadStakeConfig(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(FILE)) {
      store = JSON.parse(readFileSync(FILE, "utf8"));
    }
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

export function formatStakeAlert(
  amount: number,
  symbol: string,
  lockDays: number,
  config: StakeConfig | null,
  autoDetected = false,
): string {
  const commaAmount = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const robotCount = Math.min(25, Math.max(5, Math.floor(amount / 10000)));
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
  if (linkParts.length > 0) {
    lines.push(``, `${e("rocket")} ${linkParts.join("  ·  ")}`);
  }

  return lines.join("\n");
}
