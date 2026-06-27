import axios from "axios";
import { logger } from "../lib/logger.js";
import type { Api } from "grammy";
import type { BuyMonitorConfig } from "./buyConfig.js";
import { formatBuyAlert } from "./buyFormatter.js";
import { CHAIN_RPCS } from "./chainMonitor.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const POLL_INTERVAL_MS = 30_000;
const MAX_BLOCKS_PER_POLL = 150;
const DEXSCREENER_CACHE_TTL_MS = 5 * 60 * 1000;

const EXPLORER_TX: Record<string, (h: string) => string> = {
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bsc:      (h) => `https://bscscan.com/tx/${h}`,
  base:     (h) => `https://basescan.org/tx/${h}`,
  arbitrum: (h) => `https://arbiscan.io/tx/${h}`,
  polygon:  (h) => `https://polygonscan.com/tx/${h}`,
  optimism: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  avalanche:(h) => `https://snowtrace.io/tx/${h}`,
};

const EXPLORER_ADDR: Record<string, (a: string) => string> = {
  ethereum: (a) => `https://etherscan.io/address/${a}`,
  bsc:      (a) => `https://bscscan.com/address/${a}`,
  base:     (a) => `https://basescan.org/address/${a}`,
  arbitrum: (a) => `https://arbiscan.io/address/${a}`,
  polygon:  (a) => `https://polygonscan.com/address/${a}`,
  optimism: (a) => `https://optimistic.etherscan.io/address/${a}`,
  avalanche:(a) => `https://snowtrace.io/address/${a}`,
};

interface PriceCache {
  priceUsd: number;
  marketCap: number | null;
  change24h: number | null;
  ts: number;
}

const lastBlock: Record<string, bigint> = {};
const timers: Record<string, ReturnType<typeof setInterval>> = {};
const priceCache: Record<string, PriceCache> = {};
const seenTxs: Record<string, Set<string>> = {};

let _api: Api | null = null;

export function initBuyMonitor(api: Api): void {
  _api = api;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await axios.post(url, { jsonrpc: "2.0", id: 1, method, params }, { timeout: 10_000 });
  if (res.data.error) throw new Error(res.data.error.message);
  return res.data.result;
}

function padAddress(addr: string): string {
  return "0x" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function hexToTokenAmount(hex: string, decimals: number): number {
  const raw = BigInt(hex);
  const div = BigInt(10) ** BigInt(decimals);
  return Number(raw / div) + Number(raw % div) / 10 ** decimals;
}

function isSkippedAddress(addr: string): boolean {
  const a = addr.toLowerCase();
  return (
    a === "0x0000000000000000000000000000000000000000" ||
    a === "0x000000000000000000000000000000000000dead" ||
    a === "0x0000000000000000000000000000000000000001"
  );
}

async function fetchPrice(tokenAddress: string, chain: string): Promise<PriceCache | null> {
  const key = `${chain}:${tokenAddress.toLowerCase()}`;
  const cached = priceCache[key];
  if (cached && Date.now() - cached.ts < DEXSCREENER_CACHE_TTL_MS) return cached;

  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { timeout: 8_000 });
    const pairs: Array<{ chainId: string; priceUsd?: string; marketCap?: number; priceChange?: { h24?: number } }> =
      res.data?.pairs ?? [];
    const match = pairs.find((p) => p.chainId === chain) ?? pairs[0];
    if (!match) return null;

    const entry: PriceCache = {
      priceUsd: parseFloat(match.priceUsd ?? "0") || 0,
      marketCap: match.marketCap ?? null,
      change24h: match.priceChange?.h24 ?? null,
      ts: Date.now(),
    };
    priceCache[key] = entry;
    return entry;
  } catch {
    return cached ?? null;
  }
}

async function pollBuys(chatId: number, cfg: BuyMonitorConfig): Promise<void> {
  if (!_api) return;
  const rpcUrl = CHAIN_RPCS[cfg.chain];
  if (!rpcUrl) return;

  const key = String(chatId);
  if (!seenTxs[key]) seenTxs[key] = new Set();

  try {
    const currentHex = await rpc(rpcUrl, "eth_blockNumber", []);
    const current = BigInt(currentHex as string);

    if (!lastBlock[key]) {
      lastBlock[key] = current;
      return;
    }

    const from = lastBlock[key] + 1n;
    if (from > current) return;
    const to = from + BigInt(MAX_BLOCKS_PER_POLL) < current ? from + BigInt(MAX_BLOCKS_PER_POLL) : current;
    lastBlock[key] = to;

    // Transfer events FROM the pair address = tokens leaving the pair = buys
    const logs = await rpc(rpcUrl, "eth_getLogs", [
      {
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
        address: cfg.tokenContract.toLowerCase(),
        topics: [
          TRANSFER_TOPIC,
          padAddress(cfg.pairAddress), // from = pair
        ],
      },
    ]) as Array<{ topics: string[]; data: string; transactionHash: string }>;

    if (!logs || logs.length === 0) return;

    const price = await fetchPrice(cfg.tokenContract, cfg.chain);
    if (!price || price.priceUsd === 0) return;

    for (const log of logs) {
      const txHash = log.transactionHash;
      if (seenTxs[key].has(txHash)) continue;
      seenTxs[key].add(txHash);
      if (seenTxs[key].size > 500) {
        const arr = Array.from(seenTxs[key]);
        seenTxs[key] = new Set(arr.slice(-250));
      }

      const toAddr = "0x" + log.topics[2]?.slice(26);
      if (!toAddr || isSkippedAddress(toAddr)) continue;
      // Skip if "to" is the pair itself or token contract (not a real buy)
      if (toAddr.toLowerCase() === cfg.pairAddress.toLowerCase()) continue;
      if (toAddr.toLowerCase() === cfg.tokenContract.toLowerCase()) continue;

      const amountTokens = hexToTokenAmount(log.data, cfg.decimals);
      const usdValue = amountTokens * price.priceUsd;
      if (usdValue < cfg.minUsd) continue;

      const explorerTx = (EXPLORER_TX[cfg.chain] ?? EXPLORER_TX.ethereum)(txHash);
      const explorerAddr = (EXPLORER_ADDR[cfg.chain] ?? EXPLORER_ADDR.ethereum)(toAddr);

      const msg = formatBuyAlert(
        amountTokens,
        usdValue,
        price.priceUsd,
        price.marketCap,
        price.change24h,
        explorerAddr,
        explorerTx,
        cfg,
      );

      try {
        await _api.sendMessage(chatId, msg, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        logger.info({ chatId, usdValue, txHash }, "Buy alert sent");
      } catch (err) {
        logger.error({ err, chatId }, "Failed to send buy alert");
      }
    }
  } catch (err) {
    logger.warn({ err, chatId }, "Buy monitor poll error");
  }
}

export function startBuyMonitoring(chatId: number, cfg: BuyMonitorConfig): void {
  const key = String(chatId);
  if (timers[key]) clearInterval(timers[key]);
  delete lastBlock[key];
  timers[key] = setInterval(() => pollBuys(chatId, cfg), POLL_INTERVAL_MS);
  logger.info({ chatId, chain: cfg.chain, pair: cfg.pairAddress }, "Buy monitoring started");
}

export function stopBuyMonitoring(chatId: number): void {
  const key = String(chatId);
  if (timers[key]) { clearInterval(timers[key]); delete timers[key]; }
  delete lastBlock[key];
}

export function isBuyMonitoring(chatId: number): boolean {
  return !!timers[String(chatId)];
}

export function restoreBuyMonitors(configs: Array<{ chatId: number; monitor: BuyMonitorConfig }>): void {
  for (const { chatId, monitor } of configs) startBuyMonitoring(chatId, monitor);
}
