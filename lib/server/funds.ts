import type { NormalizedPrice, NormalizedUpdate } from "./types.js";

const getBaseUrl = () => process.env.FUND_BASE_URL || "https://fundgz.1234567.com.cn";
const getDetailBaseUrl = () => process.env.FUND_DETAIL_BASE_URL || "https://fund.eastmoney.com";

interface EastMoneyFundResponse {
  fundcode?: string;
  name?: string;
  jzrq?: string;
  dwjz?: string;
  gsz?: string;
  gszzl?: string;
  gztime?: string;
}

interface FundWorthPoint {
  x?: number;
  y?: number;
  equityReturn?: number;
  unitMoney?: string;
}

const parseNumber = (value?: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseJsonp = (body: string): EastMoneyFundResponse => {
  const match = body.match(/^[^(]*\((.*)\);?$/s);
  if (!match) throw new Error("Fund response format is invalid");
  return JSON.parse(match[1]) as EastMoneyFundResponse;
};

const parseNetWorthTrend = (body: string): FundWorthPoint[] => {
  const match = body.match(/var\s+Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Fund detail net worth is missing");
  return JSON.parse(match[1]) as FundWorthPoint[];
};

const getRealtimeFundPrice = async (symbol: string): Promise<NormalizedPrice> => {
  const fundCode = symbol.trim();
  const response = await fetch(`${getBaseUrl()}/js/${encodeURIComponent(fundCode)}.js`, {
    headers: {
      Referer: "https://fund.eastmoney.com/",
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fund request failed with ${response.status}`);
  }

  const payload = parseJsonp(await response.text());
  const currentPrice = parseNumber(payload.gsz) ?? parseNumber(payload.dwjz);

  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) {
    throw new Error(`Fund price not found for ${fundCode}`);
  }

  const previousClose = parseNumber(payload.dwjz) ?? currentPrice;

  return {
    symbol: fundCode.toUpperCase(),
    currentPrice,
    previousClose,
    currency: "CNY"
  };
};

const getDetailFundPrice = async (symbol: string): Promise<NormalizedPrice> => {
  const fundCode = symbol.trim();
  const response = await fetch(`${getDetailBaseUrl()}/pingzhongdata/${encodeURIComponent(fundCode)}.js`, {
    headers: {
      Referer: "https://fund.eastmoney.com/",
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fund detail request failed with ${response.status}`);
  }

  const trend = parseNetWorthTrend(await response.text())
    .filter((item) => typeof item.y === "number" && Number.isFinite(item.y))
    .sort((first, second) => (first.x ?? 0) - (second.x ?? 0));
  const latest = trend.at(-1)?.y;
  const previous = trend.at(-2)?.y ?? latest;

  if (typeof latest !== "number" || !Number.isFinite(latest)) {
    throw new Error(`Fund detail price not found for ${fundCode}`);
  }

  return {
    symbol: fundCode.toUpperCase(),
    currentPrice: latest,
    previousClose: typeof previous === "number" && Number.isFinite(previous) ? previous : latest,
    currency: "CNY"
  };
};

const getFundPrice = async (symbol: string): Promise<NormalizedPrice> => {
  try {
    return await getRealtimeFundPrice(symbol);
  } catch {
    return getDetailFundPrice(symbol);
  }
};

export const getFundPrices = async (symbols: string[]): Promise<NormalizedUpdate[]> => {
  const results = await Promise.allSettled(symbols.map((symbol) => getFundPrice(symbol)));
  const prices = results
    .filter((result): result is PromiseFulfilledResult<NormalizedPrice> => result.status === "fulfilled")
    .map((result) => result.value);

  if (!prices.length) {
    const message =
      results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason instanceof Error
        ? (results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason as Error).message
        : "Fund price not found";
    throw new Error(message);
  }

  return prices.map((price) => ({
    ...price,
    source: "EASTMONEY"
  }));
};
