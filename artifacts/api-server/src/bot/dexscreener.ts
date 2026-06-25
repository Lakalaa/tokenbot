import axios from "axios";

const BASE_URL = "https://api.dexscreener.com/latest/dex/tokens";

export interface TokenPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    symbol: string;
  };
  priceUsd?: string;
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
  };
  marketCap?: number;
  fdv?: number;
  txns?: {
    h24?: { buys: number; sells: number };
  };
  url?: string;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: TokenPair[] | null;
}

export async function lookupToken(address: string): Promise<TokenPair[] | null> {
  const res = await axios.get<DexScreenerResponse>(`${BASE_URL}/${address}`, {
    timeout: 10000,
    headers: { Accept: "application/json" },
  });
  return res.data?.pairs ?? null;
}
