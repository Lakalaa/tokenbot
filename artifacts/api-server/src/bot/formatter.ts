import type { TokenPair } from "./dexscreener.js";
import { e } from "./emoji.js";
import type { CustomLink } from "./links.js";

const CHAIN_LABELS: Record<string, string> = {
  solana: "Solana", ethereum: "Ethereum", bsc: "BNB Chain", base: "Base",
  arbitrum: "Arbitrum", polygon: "Polygon", avalanche: "Avalanche", optimism: "Optimism",
  fantom: "Fantom", cronos: "Cronos", sui: "Sui", ton: "TON", aptos: "Aptos",
  near: "NEAR", blast: "Blast", linea: "Linea", scroll: "Scroll", zksync: "zkSync",
  mantle: "Mantle", mode: "Mode",
};

const CHAIN_EXPLORER: Record<string, (addr: string) => string> = {
  solana:   (a) => `https://solscan.io/token/${a}`,
  ethereum: (a) => `https://etherscan.io/token/${a}`,
  bsc:      (a) => `https://bscscan.com/token/${a}`,
  base:     (a) => `https://basescan.org/token/${a}`,
  arbitrum: (a) => `https://arbiscan.io/token/${a}`,
  polygon:  (a) => `https://polygonscan.com/token/${a}`,
  avalanche:(a) => `https://snowtrace.io/token/${a}`,
  optimism: (a) => `https://optimistic.etherscan.io/token/${a}`,
};

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(priceUsd?: string): string {
  if (!priceUsd) return "N/A";
  const p = parseFloat(priceUsd);
  if (isNaN(p)) return "N/A";
  if (p < 0.000001) return `$${p.toExponential(4)}`;
  if (p < 0.01) return `$${p.toFixed(8)}`;
  if (p < 1)    return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

function fmtChange(change?: number): string {
  if (change == null) return "N/A";
  const icon = change >= 0 ? e("greenCircle") : e("redCircle");
  const sign = change >= 0 ? "+" : "";
  return `${icon} ${sign}${change.toFixed(2)}%`;
}

export interface InlineButton { text: string; url: string; }

export function buildTokenKeyboard(
  pairs: TokenPair[],
  customLinks: CustomLink[] = [],
): { inline_keyboard: InlineButton[][] } {
  const best = pairs[0];
  const explorerFn = CHAIN_EXPLORER[best.chainId];
  const explorerUrl = explorerFn ? explorerFn(best.baseToken.address) : null;

  const rows: InlineButton[][] = [];

  const row1: InlineButton[] = [];
  if (best.url) row1.push({ text: "📊 Chart", url: best.url });
  if (explorerUrl) row1.push({ text: "🔍 Explorer", url: explorerUrl });
  if (row1.length) rows.push(row1);

  for (const l of customLinks) {
    rows.push([{ text: l.text, url: l.url }]);
  }

  return { inline_keyboard: rows };
}

export function formatTokenMessage(pairs: TokenPair[]): string {
  const best = pairs[0];
  const { baseToken, chainId, dexId, priceUsd, priceChange, liquidity, volume, marketCap, fdv, txns } = best;

  const chainLabel = CHAIN_LABELS[chainId] ?? chainId.toUpperCase();
  const h24 = priceChange?.h24;
  const isBullish = (h24 ?? 0) >= 0;

  const header = isBullish
    ? `${e("rocket")} <b>${baseToken.name} (${baseToken.symbol})</b> ${e("fire")}`
    : `${e("chart")} <b>${baseToken.name} (${baseToken.symbol})</b>`;

  const txns24 = txns?.h24;

  const lines: string[] = [
    header,
    ``,
    `${e("money")} <b>Price:</b> ${fmtPrice(priceUsd)}`,
    `${isBullish ? e("up") : e("down")} <b>24h:</b> ${fmtChange(h24)}`,
    priceChange?.h1 != null ? `${e("lightning")} <b>1h:</b> ${fmtChange(priceChange.h1)}` : ``,
    priceChange?.h6 != null ? `   <b>6h:</b> ${fmtChange(priceChange.h6)}` : ``,
    ``,
    `${e("gem")} <b>Market Cap:</b> ${marketCap ? fmt(marketCap) : fdv ? fmt(fdv) + " (FDV)" : "N/A"}`,
    `${e("fire")} <b>Liquidity:</b> ${liquidity?.usd ? fmt(liquidity.usd) : "N/A"}`,
    `${e("chart")} <b>Volume 24h:</b> ${volume?.h24 ? fmt(volume.h24) : "N/A"}`,
    txns24 ? `   <b>Txns 24h:</b> ${e("greenCircle")} ${txns24.buys} buys  ${e("redCircle")} ${txns24.sells} sells` : ``,
    ``,
    `${e("globe")} <b>Chain:</b> ${chainLabel}  ·  <b>DEX:</b> ${dexId.charAt(0).toUpperCase() + dexId.slice(1)}`,
    `${e("info")} <code>${baseToken.address}</code>`,
  ];

  if (pairs.length > 1) {
    const others = [...new Set(pairs.slice(1).map((p) => CHAIN_LABELS[p.chainId] ?? p.chainId.toUpperCase()))];
    if (others.length) lines.push(``, `<i>Also on: ${others.slice(0, 4).join(", ")}</i>`);
  }

  return lines.filter((l) => l !== ``).join("\n");
}

export function formatStartMessage(): string {
  return [
    `${e("rocket")} <b>Token Info Bot</b>`,
    ``,
    `Paste any token contract address and I'll fetch live data from DexScreener.`,
    ``,
    `${e("gem")} <b>What you get:</b>`,
    `  • Live price, market cap, liquidity`,
    `  • 24h volume &amp; transactions`,
    `  • Chart &amp; Explorer buttons`,
    ``,
    `${e("lightning")} Just paste a contract address to get started!`,
  ].join("\n");
}

export function formatHelpMessage(): string {
  return [
    `${e("info")} <b>Admin commands</b>`,
    ``,
    `${e("fire")} <b>Stake alerts:</b>`,
    `  /setupstake — Configure token, supply, links`,
    `  /newstake 500000 180 — Post a stake alert`,
    `  /setbanner — Reply to an image to set banner`,
    `  /setemoji 🔥 — Set the emoji for stake rows`,
    ``,
    `${e("boom")} <b>Buy alerts:</b>`,
    `  /setupbuy contract:0x... chain:ethereum`,
    `  /stopbuy — Stop buy alerts`,
    ``,
    `${e("link")} <b>Custom link buttons:</b>`,
    `  /setlink Text https://url`,
    `  /removelink 1`,
    ``,
    `${e("lightning")} <b>Announcements:</b>`,
    `  /setannounce 30 Your message`,
    `  /stopannounce`,
  ].join("\n");
}
