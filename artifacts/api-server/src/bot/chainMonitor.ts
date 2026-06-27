import axios from "axios";
import { logger } from "../lib/logger.js";
import type { Api } from "grammy";
import { getStakeConfig, setStakeConfig, sendStakeAlert } from "./stakeConfig.js";
import type { StakeMonitorConfig } from "./stakeConfig.js";

// Public RPC endpoints — no API key needed
export const CHAIN_RPCS: Record<string, string> = {
  ethereum:  "https://eth.llamarpc.com",
  bsc:       "https://bsc-dataseed.binance.org",
  base:      "https://mainnet.base.org",
  arbitrum:  "https://arb1.llamarpc.com",
  polygon:   "https://polygon.llamarpc.com",
  optimism:  "https://mainnet.optimism.io",
  avalanche: "https://api.avax.network/ext/bc/C/rpc",
  blast:     "https://rpc.blast.io",
  linea:     "https://rpc.linea.build",
  zksync:    "https://mainnet.era.zksync.io",
};

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// keccak256("Staked(address,uint256)")
const STAKED_TOPIC = "0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d";

const POLL_INTERVAL_MS = 30_000;
const MAX_BLOCKS_PER_POLL = 200;

// Per-group state
const lastBlock: Record<string, bigint> = {};
const timers: Record<string, ReturnType<typeof setInterval>> = {};
let _api: Api | null = null;

export function initChainMonitor(api: Api): void {
  _api = api;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await axios.post(
    url,
    { jsonrpc: "2.0", id: 1, method, params },
    { timeout: 10_000 },
  );
  if (res.data.error) throw new Error(res.data.error.message);
  return res.data.result;
}

function padAddress(addr: string): string {
  return "0x" + addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function hexToDecimal(hex: string, decimals: number): number {
  const raw = BigInt(hex);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  return Number(whole) + Number(frac) / 10 ** decimals;
}

async function getCurrentBlock(rpcUrl: string): Promise<bigint> {
  const hex = await rpc(rpcUrl, "eth_blockNumber", []);
  return BigInt(hex as string);
}

async function pollGroup(chatId: number, monitor: StakeMonitorConfig): Promise<void> {
  if (!_api) return;
  const rpcUrl = CHAIN_RPCS[monitor.chain];
  if (!rpcUrl) return;

  try {
    const current = await getCurrentBlock(rpcUrl);
    const key = String(chatId);

    if (!lastBlock[key]) {
      lastBlock[key] = current;
      return;
    }

    const from = lastBlock[key] + 1n;
    const to = current;
    if (from > to) return;

    // Limit range per poll
    const cappedTo = from + BigInt(MAX_BLOCKS_PER_POLL) < to ? from + BigInt(MAX_BLOCKS_PER_POLL) : to;
    lastBlock[key] = cappedTo;

    const stakingAddr = monitor.stakingContract.toLowerCase();
    const tokenAddr = monitor.tokenContract.toLowerCase();

    // Try Staked(address,uint256) event first, fallback to Transfer to staking contract
    const logs = await rpc(rpcUrl, "eth_getLogs", [
      {
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + cappedTo.toString(16),
        address: tokenAddr,
        topics: [
          [TRANSFER_TOPIC, STAKED_TOPIC],
          null,
          padAddress(stakingAddr),
        ],
      },
    ]) as Array<{ topics: string[]; data: string; transactionHash: string }>;

    if (!logs || logs.length === 0) return;

    const stakeConfig = getStakeConfig(chatId);

    for (const log of logs) {
      const amountHex = log.data;
      if (!amountHex || amountHex === "0x") continue;
      const amount = hexToDecimal(amountHex, monitor.decimals ?? 18);
      if (amount < (monitor.minAlert ?? 0)) continue;

      // Auto-update total staked
      if (stakeConfig) {
        stakeConfig.totalStaked = (stakeConfig.totalStaked ?? 0) + amount;
      }

      // Persist updated total
      if (stakeConfig) setStakeConfig(chatId, { totalStaked: stakeConfig.totalStaked });

      try {
        await sendStakeAlert(_api, chatId, amount, 0, stakeConfig ?? null);
        logger.info({ chatId, amount, tx: log.transactionHash }, "Stake alert sent");
      } catch (err) {
        logger.error({ err, chatId }, "Failed to send stake alert");
      }
    }
  } catch (err) {
    logger.warn({ err, chatId }, "Chain poll error — will retry");
  }
}

export function startMonitoring(chatId: number, monitor: StakeMonitorConfig): void {
  const key = String(chatId);
  if (timers[key]) clearInterval(timers[key]);
  delete lastBlock[key]; // reset so first poll just records current block
  timers[key] = setInterval(() => pollGroup(chatId, monitor), POLL_INTERVAL_MS);
  logger.info({ chatId, chain: monitor.chain, contract: monitor.stakingContract }, "Chain monitoring started");
}

export function stopMonitoring(chatId: number): void {
  const key = String(chatId);
  if (timers[key]) {
    clearInterval(timers[key]);
    delete timers[key];
    delete lastBlock[key];
  }
}

export function isMonitoring(chatId: number): boolean {
  return !!timers[String(chatId)];
}

export function restoreMonitors(configs: Array<{ chatId: number; monitor: StakeMonitorConfig }>): void {
  for (const { chatId, monitor } of configs) {
    startMonitoring(chatId, monitor);
  }
}
