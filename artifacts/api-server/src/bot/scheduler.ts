import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../lib/logger.js";
import type { Api } from "grammy";

const DATA_DIR = join(process.cwd(), "bot-data");
const FILE = join(DATA_DIR, "schedules.json");

interface ScheduleRecord {
  chatId: number;
  text: string;
  intervalMinutes: number;
}

let store: Record<string, ScheduleRecord> = {};
const timers: Record<string, ReturnType<typeof setInterval>> = {};
let _api: Api | null = null;

export function initScheduler(api: Api): void {
  _api = api;
  loadAndStart();
}

function loadAndStart(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(FILE)) {
      store = JSON.parse(readFileSync(FILE, "utf8"));
      for (const record of Object.values(store)) {
        startTimer(record);
      }
      logger.info({ count: Object.keys(store).length }, "Loaded recurring messages");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load schedules — starting fresh");
    store = {};
  }
}

function save(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to save schedules");
  }
}

function startTimer(record: ScheduleRecord): void {
  const key = String(record.chatId);
  if (timers[key]) clearInterval(timers[key]);
  timers[key] = setInterval(
    async () => {
      if (!_api) return;
      try {
        await _api.sendMessage(record.chatId, record.text, { parse_mode: "HTML" });
      } catch (err) {
        logger.error({ err, chatId: record.chatId }, "Failed to send recurring message");
      }
    },
    record.intervalMinutes * 60 * 1000,
  );
}

export function setAnnouncement(chatId: number, intervalMinutes: number, text: string): void {
  const key = String(chatId);
  const record: ScheduleRecord = { chatId, intervalMinutes, text };
  store[key] = record;
  save();
  startTimer(record);
}

export function getAnnouncement(chatId: number): ScheduleRecord | null {
  return store[String(chatId)] ?? null;
}

export function stopAnnouncement(chatId: number): boolean {
  const key = String(chatId);
  if (!store[key]) return false;
  if (timers[key]) {
    clearInterval(timers[key]);
    delete timers[key];
  }
  delete store[key];
  save();
  return true;
}
