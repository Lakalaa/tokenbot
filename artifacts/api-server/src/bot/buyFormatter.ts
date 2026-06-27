import { e } from "./emoji.js";
import type { BuyMonitorConfig } from "./buyConfig.js";

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(price: number): string {
  if (price < 0.000001) return `$${price.toExponential(4)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

function fmtAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fireRow(usdValue: number): string {
  let count: number;
  let useWhale = false;
  if (usdValue >= 10_000) { count = 25; useWhale = true; }
  else if (usdValue >= 5_000) count = 20;
  else if (usdValue >= 1_000) count = 15;
  else if (usdValue >= 500)  count = 10;
  else if (usdValue >= 200)  count = 7;
  else if (usdValue >= 50)   count = 5;
  else count = 3;

  const fires = Array(count).fill(e("fire")).join("");
  return useWhale ? `${e("crown")} ${fires} ${e("crown")}` : fires;
}

export function formatBuyAlert(
  amountTokens: number,
  usdValue: number,
  priceUsd: number,
  marketCap: number | null,
  change24h: number | null,
  buyer: string,
  txHash: string,
  cfg: BuyMonitorConfig,
): string {
  const row = fireRow(usdValue);
  const changeStr = change24h != null
    ? ` ${change24h >= 0 ? e("up") : e("down")} ${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%`
    : "";

  const lines: string[] = [
    row,
    ``,
    `${e("rocket")} <b>NEW BUY!</b> — <b>$${cfg.symbol}</b>`,
    ``,
    `${e("boom")} <b>${fmtUsd(usdValue)}</b>`,
    `   ${fmtAmount(amountTokens)} $${cfg.symbol}`,
    ``,
    `${e("money")} Price: <b>${fmtPrice(priceUsd)}</b>${changeStr}`,
    marketCap ? `${e("gem")} Market Cap: <b>${fmtUsd(marketCap)}</b>` : "",
    ``,
    `${e("globe")} <a href="https://etherscan.io/address/${buyer}">Buyer</a>  ·  <a href="https://etherscan.io/tx/${txHash}">Tx</a>`,
  ];

  const linkParts: string[] = [];
  if (cfg.chartUrl) linkParts.push(`<a href="${cfg.chartUrl}">📊 Chart</a>`);
  if (cfg.buyUrl) linkParts.push(`<a href="${cfg.buyUrl}">🛒 Buy</a>`);
  if (cfg.websiteUrl) linkParts.push(`<a href="${cfg.websiteUrl}">🌐 Website</a>`);
  if (linkParts.length > 0) lines.push(``, `${e("link")} ${linkParts.join("  ·  ")}`);

  return lines.filter((l) => l !== "").join("\n");
}
