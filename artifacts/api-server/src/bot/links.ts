import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";

const DATA_DIR = join(process.cwd(), "bot-data");
const LINKS_FILE = join(DATA_DIR, "custom-links.json");

export interface CustomLink {
  text: string;
  url: string;
}

let store: Record<string, CustomLink[]> = {};

export function loadLinks(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(LINKS_FILE)) {
      store = JSON.parse(readFileSync(LINKS_FILE, "utf8"));
      logger.info("Loaded custom links from disk");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load custom links — starting fresh");
    store = {};
  }
}

function save(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(LINKS_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to save custom links");
  }
}

export function getLinks(chatId: number): CustomLink[] {
  return store[String(chatId)] ?? [];
}

export function addLink(chatId: number, text: string, url: string): void {
  const key = String(chatId);
  if (!store[key]) store[key] = [];
  store[key].push({ text, url });
  save();
}

export function removeLink(chatId: number, index: number): boolean {
  const key = String(chatId);
  if (!store[key] || index < 0 || index >= store[key].length) return false;
  store[key].splice(index, 1);
  save();
  return true;
}

export function clearLinks(chatId: number): void {
  delete store[String(chatId)];
  save();
}
