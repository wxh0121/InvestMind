import type { NormalizedUpdate } from "./types.js";

const REQUEST_TIMEOUT_MS = 4500;

const getTencentQuoteBaseUrl = () => process.env.TENCENT_QUOTE_BASE_URL || "https://qt.gtimg.cn";

const getEastMoneyQuoteBaseUrl = () =>
  process.env.EASTMONEY_QUOTE_BASE_URL || "https://push2.eastmoney.com";

const getSinaQuoteBaseUrl = () => process.env.SINA_QUOTE_BASE_URL || "https://hq.sinajs.cn";

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

interface IndexRequest {
  symbol: string;
  secid: string;
  tencentCode: string;
  sinaCode: string;
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

const parseFinite = (value: string | number | undefined) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
};

const roundPrice = (value: number) => Number(value.toFixed(4));

const withTimeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

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

const toIndexRequest = (symbol: string): IndexRequest | undefined => {
  const secid = toSecid(symbol);
  if (!secid) return undefined;

  const [market, code] = secid.split(".");
  const prefix = market === "1" ? "sh" : "sz";

  return {
    symbol: normalizeIndexSymbol(symbol),
    secid,
    tencentCode: `${prefix}${code}`,
    sinaCode: `s_${prefix}${code}`
  };
};

const getIndexRequests = (symbols: string[]) => {
  const requests = symbols
    .map((symbol) => ({
      symbol,
      request: toIndexRequest(symbol)
    }))
    .filter((item): item is { symbol: string; request: IndexRequest } => Boolean(item.request))
    .map((item) => item.request);

  if (!requests.length) {
    throw new Error("A-share index symbols are required");
  }

  return requests;
};

const getTencentIndexPrices = async (requests: IndexRequest[]): Promise<NormalizedUpdate[]> => {
  const response = await fetch(`${getTencentQuoteBaseUrl()}/q=${requests.map((item) => item.tencentCode).join(",")}`, {
    headers: {
      Referer: "https://finance.qq.com/",
      "User-Agent": "Mozilla/5.0"
    },
    signal: withTimeout()
  });

  if (!response.ok) {
    throw new Error(`Tencent index request failed with ${response.status}`);
  }

  const text = await response.text();

  return requests.map((request) => {
    const match = text.match(new RegExp(`v_${request.tencentCode}="([^"]*)"`));
    const fields = match?.[1]?.split("~") ?? [];
    const currentPrice = parseFinite(fields[3]);
    const previousClose = parseFinite(fields[4]);

    if (currentPrice === undefined || previousClose === undefined) {
      throw new Error(`Tencent index price not found for ${request.symbol}`);
    }

    return {
      symbol: request.symbol,
      currentPrice,
      previousClose,
      currency: "CNY",
      source: "TENCENT"
    };
  });
};

const getEastMoneyIndexPrices = async (requests: IndexRequest[]): Promise<NormalizedUpdate[]> => {
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
    },
    signal: withTimeout()
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

const getSinaIndexPrices = async (requests: IndexRequest[]): Promise<NormalizedUpdate[]> => {
  const response = await fetch(`${getSinaQuoteBaseUrl()}/list=${requests.map((item) => item.sinaCode).join(",")}`, {
    headers: {
      Referer: "https://finance.sina.com.cn/",
      "User-Agent": "Mozilla/5.0"
    },
    signal: withTimeout()
  });

  if (!response.ok) {
    throw new Error(`Sina index request failed with ${response.status}`);
  }

  const text = await response.text();

  return requests.map((request) => {
    const match = text.match(new RegExp(`hq_str_${request.sinaCode}="([^"]*)"`));
    const fields = match?.[1]?.split(",") ?? [];
    const currentPrice = parseFinite(fields[1]);
    const change = parseFinite(fields[2]);

    if (currentPrice === undefined || change === undefined) {
      throw new Error(`Sina index price not found for ${request.symbol}`);
    }

    return {
      symbol: request.symbol,
      currentPrice,
      previousClose: roundPrice(currentPrice - change),
      currency: "CNY",
      source: "SINA"
    };
  });
};

export const getChinaIndexPrices = async (symbols: string[]): Promise<NormalizedUpdate[]> => {
  const requests = getIndexRequests(symbols);
  const errors: string[] = [];

  for (const loader of [getTencentIndexPrices, getEastMoneyIndexPrices, getSinaIndexPrices]) {
    try {
      return await loader(requests);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown index source error");
    }
  }

  throw new Error(`A-share index requests failed: ${errors.join("; ")}`);
};
