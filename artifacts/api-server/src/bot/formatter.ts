import type { TokenPair } from "./dexscreener.js";
import { e } from "./emoji.js";
import type { CustomLink } from "./links.js";

const CHAIN_LABELS: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  bsc: "BNB Chain",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalanche: "Avalanche",
  optimism: "Optimism",
  fantom: "Fantom",
  cronos: "Cronos",
  sui: "Sui",
  ton: "TON",
  aptos: "Aptos",
  near: "NEAR",
  blast: "Blast",
  linea: "Linea",
  scroll: "Scroll",
  zksync: "zkSync",
  mantle: "Mantle",
  mode: "Mode",
};

const CHAIN_EXPLORER: Record<string, (addr: string) => string> = {
  solana: (a) => `https://solscan.io/token/${a}`,
  ethereum: (a) => `https://etherscan.io/token/${a}`,
  bsc: (a) => `https://bscscan.com/token/${a}`,
  base: (a) => `https://basescan.org/token/${a}`,
  arbitrum: (a) => `https://arbiscan.io/token/${a}`,
  polygon: (a) => `https://polygonscan.com/token/${a}`,
  avalanche: (a) => `https://snowtrace.io/token/${a}`,
  optimism: (a) => `https://optimistic.etherscan.io/token/${a}`,
};

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(priceUsd?: string): string {
  if (!priceUsd) return "N/A";
  const p = parseFloat(priceUsd);
  if (isNaN(p)) return "N/A";
  if (p < 0.000001) return `$${p.toExponential(4)}`;
  if (p < 0.01) return `$${p.toFixed(8)}`;
  if (p < 1) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

function fmtChange(change?: number): string {
  if (change == null) return "N/A";
  const icon = change >= 0 ? e("greenCircle") : e("redCircle");
  const sign = change >= 0 ? "+" : "";
  return `${icon} ${sign}${change.toFixed(2)}%`;
}

export function formatTokenMessage(pairs: TokenPair[], customLinks: CustomLink[] = []): string {
  const best = pairs[0];
  const { baseToken, chainId, dexId, priceUsd, priceChange, liquidity, volume, marketCap, fdv, txns, url } = best;

  const chainLabel = CHAIN_LABELS[chainId] ?? chainId.toUpperCase();
  const explorerFn = CHAIN_EXPLORER[chainId];
  const explorerUrl = explorerFn ? explorerFn(baseToken.address) : null;

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
    `${e("globe")} <b>Chain:</b> ${chainLabel}`,
    `   <b>DEX:</b> ${dexId.charAt(0).toUpperCase() + dexId.slice(1)}`,
    `   <b>CA:</b> <code>${baseToken.address}</code>`,
    `   <b>Pair:</b> <code>${best.pairAddress}</code>`,
  ];

  if (pairs.length > 1) {
    const otherChains = [
      ...new Set(pairs.slice(1).map((p) => CHAIN_LABELS[p.chainId] ?? p.chainId.toUpperCase())),
    ];
    if (otherChains.length > 0) {
      lines.push(``, `${e("info")} <i>Also on: ${otherChains.slice(0, 4).join(", ")}</i>`);
    }
  }

  const linkParts: string[] = [];
  if (url) linkParts.push(`<a href="${url}">DexScreener</a>`);
  if (explorerUrl) linkParts.push(`<a href="${explorerUrl}">Explorer</a>`);
  if (linkParts.length > 0) {
    lines.push(``, `${e("link")} ${linkParts.join("  ·  ")}`);
  }

  if (customLinks.length > 0) {
    const custom = customLinks.map((l) => `<a href="${l.url}">${l.text}</a>`).join("  ·  ");
    lines.push(``, `${e("rocket")} ${custom}`);
  }

  return lines.filter((l) => l !== ``).join("\n");
}

export function formatStartMessage(): string {
  return [
    `${e("rocket")} <b>Token Info Bot</b>`,
    ``,
    `Send me any token contract address and I'll fetch live data from DexScreener across all chains.`,
    ``,
    `${e("gem")} <b>Supported chains:</b> Solana, Ethereum, BNB Chain, Base, Arbitrum, Polygon, Avalanche, Optimism, TON, Sui, and more.`,
    ``,
    `${e("fire")} <b>What you get:</b>`,
    `  • Live price in USD`,
    `  • Price change (1h / 6h / 24h)`,
    `  • Market cap &amp; liquidity`,
    `  • 24h volume &amp; transactions`,
    `  • Contract address &amp; DEX info`,
    `  • Links to DexScreener &amp; Explorer`,
    ``,
    `${e("lightning")} Just paste a contract address to get started!`,
  ].join("\n");
}

export function formatHelpMessage(): string {
  return [
    `${e("info")} <b>How to use this bot</b>`,
    ``,
    `Paste any token contract address directly in the chat (works in groups too).`,
    ``,
    `<b>Examples:</b>`,
    `  Solana: <code>So11111111111111111111111111111111111111112</code>`,
    `  Ethereum: <code>0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2</code>`,
    ``,
    `<b>Commands:</b>`,
    `  /start — Welcome message`,
    `  /help — This message`,
    ``,
    `${e("link")} <b>Custom link commands (admins only):</b>`,
    `  /setlink Text https://url — Add a link to all token lookups`,
    `  /listlinks — Show current links`,
    `  /removelink 1 — Remove link by number`,
    `  /clearlinks — Remove all links`,
    ``,
    `${e("lightning")} <b>Recurring announcements (admins only):</b>`,
    `  /setannounce 30 Your message — Post every 30 minutes`,
    `  /showannounce — Show active announcement`,
    `  /stopannounce — Stop recurring message`,
    ``,
    `${e("fire")} <b>Staking alerts (admins only):</b>`,
    `  /setupstake symbol:AR supply:1000000000 stakeurl:https://...`,
    `  /newstake 500000 180 — Post a new stake alert`,
    ``,
    `${e("boom")} <b>Buy alerts (admins only):</b>`,
    `  /setupbuy contract:0x... chain:ethereum — Start buy alerts`,
    `  /buystatus — Show active buy alert config`,
    `  /stopbuy — Stop buy alerts`,
  ].join("\n");
}
