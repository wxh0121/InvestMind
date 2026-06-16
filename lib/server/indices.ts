import type { NormalizedUpdate } from "./types.js";

const getEastMoneyQuoteBaseUrl = () =>
  process.env.EASTMONEY_QUOTE_BASE_URL || "https://push2.eastmoney.com";

interface EastMoneyIndexItem {
  f2?: number;
  f3?: number;
  f4?: number;
  f12?: string;
  f14?: string;
  f18?: number;
}

interface EastMoneyIndexResponse {
  rc?: number;
  data?: {
    diff?: EastMoneyIndexItem[];
  };
}

const INDEX_SECIDS: Record<string, string> = {
  SH000001: "1.000001",
  "000001.SS": "1.000001",
  "000001.SH": "1.000001",
  SSE: "1.000001",
  SZ399001: "0.399001",
  "399001.SZ": "0.399001",
  SZSE: "0.399001",
  "399006.SZ": "0.399006",
  SZ399006: "0.399006",
  CHINEXT: "0.399006"
};

const normalizeIndexSymbol = (symbol: string) => symbol.trim().toUpperCase();

const toSecid = (symbol: string) => {
  const normalized = normalizeIndexSymbol(symbol);
  const known = INDEX_SECIDS[normalized];
  if (known) return known;

  if (/^\d{6}$/.test(normalized)) {
    return /^[569]/.test(normalized) ? `1.${normalized}` : `0.${normalized}`;
  }

  const prefixed = normalized.match(/^(SH|SZ)(\d{6})$/);
  if (prefixed) {
    return `${prefixed[1] === "SH" ? "1" : "0"}.${prefixed[2]}`;
  }

  return undefined;
};

export const getEastMoneyIndexPrices = async (symbols: string[]): Promise<NormalizedUpdate[]> => {
  const requests = symbols
    .map((symbol) => ({
      symbol: normalizeIndexSymbol(symbol),
      secid: toSecid(symbol)
    }))
    .filter((item): item is { symbol: string; secid: string } => Boolean(item.secid));

  if (!requests.length) {
    throw new Error("EastMoney index symbols are required");
  }

  const query = new URLSearchParams({
    fltt: "2",
    invt: "2",
    fields: "f12,f14,f2,f3,f4,f18",
    secids: requests.map((item) => item.secid).join(",")
  });
  const response = await fetch(`${getEastMoneyQuoteBaseUrl()}/api/qt/ulist.np/get?${query.toString()}`, {
    headers: {
      Referer: "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`EastMoney index request failed with ${response.status}`);
  }

  const payload = (await response.json()) as EastMoneyIndexResponse;
  const items = payload.data?.diff ?? [];
  const byCode = new Map(items.map((item) => [item.f12, item]));

  return requests.map((request) => {
    const code = request.secid.split(".")[1];
    const item = byCode.get(code);
    const currentPrice = item?.f2;
    const previousClose = item?.f18;

    if (
      typeof currentPrice !== "number" ||
      !Number.isFinite(currentPrice) ||
      typeof previousClose !== "number" ||
      !Number.isFinite(previousClose)
    ) {
      throw new Error(`EastMoney index price not found for ${request.symbol}`);
    }

    return {
      symbol: request.symbol,
      currentPrice,
      previousClose,
      currency: "CNY",
      source: "EASTMONEY"
    };
  });
};
