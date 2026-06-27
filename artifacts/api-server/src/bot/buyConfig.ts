import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";

const DATA_DIR = join(process.cwd(), "bot-data");
const FILE = join(DATA_DIR, "buy-config.json");

export interface BuyMonitorConfig {
  chain: string;
  tokenContract: string;
  pairAddress: string;
  symbol: string;
  decimals: number;
  minUsd: number;
  chartUrl?: string;
  buyUrl?: string;
  websiteUrl?: string;
}

export interface BuyConfig {
  monitor?: BuyMonitorConfig;
}

let store: Record<string, BuyConfig> = {};

export function loadBuyConfig(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(FILE)) store = JSON.parse(readFileSync(FILE, "utf8"));
  } catch (err) {
    logger.warn({ err }, "Failed to load buy config");
    store = {};
  }
}

function save(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to save buy config");
  }
}

export function getBuyConfig(chatId: number): BuyConfig | null {
  return store[String(chatId)] ?? null;
}

export function setBuyConfig(chatId: number, config: Partial<BuyConfig>): BuyConfig {
  const key = String(chatId);
  store[key] = { ...store[key], ...config } as BuyConfig;
  save();
  return store[key];
}

export function getAllBuyConfigs(): Array<{ chatId: number; config: BuyConfig }> {
  return Object.entries(store).map(([k, v]) => ({ chatId: Number(k), config: v }));
}

export function deleteBuyConfig(chatId: number): void {
  delete store[String(chatId)];
  save();
}
