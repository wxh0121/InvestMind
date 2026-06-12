import type { HistoricalCandle, NormalizedPrice, NormalizedUpdate } from "./types.js";

const getBaseUrl = () => process.env.YAHOO_BASE_URL || "https://query1.finance.yahoo.com";

interface YahooPriceInput {
  symbol: string;
  market?: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        chartPreviousClose?: number;
        currency?: string;
        previousClose?: number;
        regularMarketPrice?: number;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          open?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    } | null;
  };
}

const INDEX_SYMBOLS: Record<string, string> = {
  DJI: "^DJI",
  GSPC: "^GSPC",
  HSI: "^HSI",
  IXIC: "^IXIC",
  N225: "^N225",
  SH000001: "000001.SS",
  SZ399001: "399001.SZ"
};

const getLastClose = (closes?: Array<number | null>) => {
  if (!closes) return undefined;

  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const close = closes[index];
    if (typeof close === "number" && Number.isFinite(close)) return close;
  }

  return undefined;
};

export const normalizeYahooSymbol = (symbol: string, market?: string) => {
  const rawSymbol = symbol.trim().toUpperCase();
  if (!rawSymbol) return rawSymbol;

  const knownIndex = INDEX_SYMBOLS[rawSymbol];
  if (knownIndex) return knownIndex;
  if (rawSymbol.startsWith("^") || rawSymbol.includes(".")) return rawSymbol;

  const prefixedAshare = rawSymbol.match(/^(SH|SZ)(\d{6})$/);
  if (prefixedAshare) {
    return `${prefixedAshare[2]}.${prefixedAshare[1] === "SH" ? "SS" : "SZ"}`;
  }

  if (market === "HK_STOCK" && /^\d{1,5}$/.test(rawSymbol)) {
    return `${rawSymbol.padStart(4, "0")}.HK`;
  }

  if (market === "A_SHARE" && /^\d{6}$/.test(rawSymbol)) {
    return `${rawSymbol}.${/^[569]/.test(rawSymbol) ? "SS" : "SZ"}`;
  }

  return rawSymbol;
};

const getYahooPrice = async ({ symbol, market }: YahooPriceInput): Promise<NormalizedPrice> => {
  const originalSymbol = symbol.trim().toUpperCase();
  const yahooSymbol = normalizeYahooSymbol(originalSymbol, market);
  const requestPath = `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`;
  const response = await fetch(`${getBaseUrl()}${requestPath}`, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed with ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const error = payload.chart?.error;
  if (error) {
    throw new Error(error.description || "Yahoo Finance returned an error");
  }

  const result = payload.chart?.result?.[0];
  const currentPrice =
    result?.meta?.regularMarketPrice ?? getLastClose(result?.indicators?.quote?.[0]?.close);

  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) {
    throw new Error(`Yahoo Finance price not found for ${originalSymbol}`);
  }

  const previousClose = result?.meta?.previousClose ?? result?.meta?.chartPreviousClose ?? currentPrice;

  return {
    symbol: originalSymbol,
    currentPrice,
    previousClose,
    currency: result?.meta?.currency || "USD"
  };
};

export const getYahooPrices = async (items: YahooPriceInput[]): Promise<NormalizedUpdate[]> => {
  const prices = await Promise.all(items.map((item) => getYahooPrice(item)));

  return prices.map((price) => ({
    ...price,
    source: "YAHOO"
  }));
};

export const getYahooHistory = async (
  { symbol, market }: YahooPriceInput,
  range = "1y",
  interval = "1d"
): Promise<HistoricalCandle[]> => {
  const originalSymbol = symbol.trim().toUpperCase();
  const yahooSymbol = normalizeYahooSymbol(originalSymbol, market);
  const requestPath = `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const response = await fetch(`${getBaseUrl()}${requestPath}`, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance history request failed with ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const error = payload.chart?.error;
  if (error) {
    throw new Error(error.description || "Yahoo Finance returned an error");
  }

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close ?? [];

  return closes
    .map((close, index): HistoricalCandle | null => {
      if (typeof close !== "number" || !Number.isFinite(close)) return null;

      const timestamp = timestamps[index] ? timestamps[index] * 1000 : Date.now();
      const high = quote?.high?.[index] ?? undefined;
      const low = quote?.low?.[index] ?? undefined;
      const open = quote?.open?.[index] ?? undefined;
      const volume = quote?.volume?.[index] ?? undefined;

      return {
        timestamp,
        close,
        open: typeof open === "number" && Number.isFinite(open) ? open : undefined,
        high: typeof high === "number" && Number.isFinite(high) ? high : undefined,
        low: typeof low === "number" && Number.isFinite(low) ? low : undefined,
        volume: typeof volume === "number" && Number.isFinite(volume) ? volume : undefined
      };
    })
    .filter((item): item is HistoricalCandle => Boolean(item));
};
