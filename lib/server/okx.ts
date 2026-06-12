import crypto from "node:crypto";
import type { HistoricalCandle, NormalizedBalance, NormalizedPrice } from "./types.js";

const getBaseUrl = () => process.env.OKX_BASE_URL || "https://www.okx.com";

const getOkxCredentials = () => ({
  apiKey: process.env.OKX_API_KEY,
  apiSecret: process.env.OKX_API_SECRET,
  passphrase: process.env.OKX_API_PASSPHRASE
});

const signOkxRequest = (timestamp: string, method: string, requestPath: string, body = "") => {
  const { apiSecret } = getOkxCredentials();
  if (!apiSecret) throw new Error("OKX_API_SECRET is not configured");
  return crypto.createHmac("sha256", apiSecret).update(`${timestamp}${method}${requestPath}${body}`).digest("base64");
};

const okxFetch = async <T>(requestPath: string, privateRequest = false): Promise<T> => {
  const baseUrl = getBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (privateRequest) {
    const { apiKey, passphrase } = getOkxCredentials();
    if (!apiKey || !passphrase) {
      throw new Error("OKX API credentials are not fully configured");
    }
    const timestamp = new Date().toISOString();
    headers["OK-ACCESS-KEY"] = apiKey;
    headers["OK-ACCESS-SIGN"] = signOkxRequest(timestamp, "GET", requestPath);
    headers["OK-ACCESS-TIMESTAMP"] = timestamp;
    headers["OK-ACCESS-PASSPHRASE"] = passphrase;
  }

  const response = await fetch(`${baseUrl}${requestPath}`, { headers });
  if (!response.ok) {
    throw new Error(`OKX request failed with ${response.status}`);
  }

  const payload = (await response.json()) as T & { code?: string; msg?: string };
  if (payload.code && payload.code !== "0") {
    throw new Error(payload.msg || `OKX error code ${payload.code}`);
  }
  return payload;
};

interface OkxBalanceResponse {
  data?: Array<{
    details?: Array<{
      ccy: string;
      eq?: string;
      availBal?: string;
    }>;
  }>;
}

interface OkxTickerResponse {
  data?: Array<{
    instId: string;
    last?: string;
    open24h?: string;
    sodUtc0?: string;
  }>;
}

interface OkxCandlesResponse {
  data?: string[][];
}

export const getOkxBalances = async (): Promise<NormalizedBalance[]> => {
  const payload = await okxFetch<OkxBalanceResponse>("/api/v5/account/balance", true);
  const details = payload.data?.flatMap((item) => item.details ?? []) ?? [];

  return details
    .map((item) => ({
      symbol: item.ccy.toUpperCase(),
      quantity: Number(item.eq ?? item.availBal ?? 0),
      currency: "USD"
    }))
    .filter((item) => item.quantity > 0);
};

export const getOkxPrices = async (symbols: string[]): Promise<NormalizedPrice[]> => {
  const prices: NormalizedPrice[] = [];

  for (const symbol of symbols) {
    const instId = `${symbol.toUpperCase()}-USDT`;
    const payload = await okxFetch<OkxTickerResponse>(
      `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`
    );
    const ticker = payload.data?.[0];
    if (!ticker) {
      throw new Error(`OKX ticker not found for ${symbol}`);
    }
    const currentPrice = Number(ticker.last ?? 0);
    // Crypto trades continuously; open24h is used as a practical previous-price proxy for now.
    const previousClose = Number(ticker.open24h ?? ticker.sodUtc0 ?? ticker.last ?? 0);

    prices.push({
      symbol: symbol.toUpperCase(),
      currentPrice,
      previousClose,
      currency: "USD"
    });
  }

  return prices;
};

export const getOkxHistory = async (symbol: string, limit = 240): Promise<HistoricalCandle[]> => {
  const instId = `${symbol.trim().toUpperCase()}-USDT`;
  const payload = await okxFetch<OkxCandlesResponse>(
    `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=1D&limit=${limit}`
  );

  return (payload.data ?? [])
    .map((item): HistoricalCandle | null => {
      const timestamp = Number(item[0]);
      const open = Number(item[1]);
      const high = Number(item[2]);
      const low = Number(item[3]);
      const close = Number(item[4]);
      const volume = Number(item[5]);

      if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return null;

      return {
        timestamp,
        open: Number.isFinite(open) ? open : undefined,
        high: Number.isFinite(high) ? high : undefined,
        low: Number.isFinite(low) ? low : undefined,
        close,
        volume: Number.isFinite(volume) ? volume : undefined
      };
    })
    .filter((item): item is HistoricalCandle => Boolean(item))
    .sort((first, second) => first.timestamp - second.timestamp);
};
