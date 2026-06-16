import type { GlobalMarketGroup, GlobalMarketGroupKey, GlobalMarketItem, GlobalMarketSnapshot } from "@/types/globalMarket";

interface PricePayload {
  prices?: Array<{
    symbol: string;
    currentPrice: number;
    previousClose: number;
    currency?: string;
  }>;
  error?: string;
}

interface MarketDefinition {
  key: GlobalMarketGroupKey;
  label: string;
  source: "YAHOO" | "OKX" | "EASTMONEY";
  items: Array<{
    key: string;
    label: string;
    symbol: string;
  }>;
}

const marketDefinitions: MarketDefinition[] = [
  {
    key: "A_SHARE",
    label: "A股",
    source: "EASTMONEY",
    items: [
      { key: "sse", label: "上证", symbol: "SH000001" },
      { key: "szse", label: "深成", symbol: "SZ399001" },
      { key: "chinext", label: "创业板", symbol: "399006.SZ" }
    ]
  },
  {
    key: "HK_STOCK",
    label: "港股",
    source: "YAHOO",
    items: [{ key: "hsi", label: "恒生", symbol: "^HSI" }]
  },
  {
    key: "US_STOCK",
    label: "美股",
    source: "YAHOO",
    items: [
      { key: "sp500", label: "标普500", symbol: "^GSPC" },
      { key: "nasdaq", label: "纳指", symbol: "^IXIC" },
      { key: "dow", label: "道指", symbol: "^DJI" }
    ]
  },
  {
    key: "JAPAN_KOREA",
    label: "日韩",
    source: "YAHOO",
    items: [
      { key: "nikkei", label: "日经", symbol: "^N225" },
      { key: "kospi", label: "KOSPI", symbol: "^KS11" }
    ]
  },
  {
    key: "EUROPE",
    label: "欧洲",
    source: "YAHOO",
    items: [
      { key: "ftse", label: "富时100", symbol: "^FTSE" },
      { key: "dax", label: "DAX", symbol: "^GDAXI" },
      { key: "cac", label: "CAC40", symbol: "^FCHI" }
    ]
  },
  {
    key: "CRYPTO",
    label: "加密",
    source: "OKX",
    items: [
      { key: "btc", label: "BTC", symbol: "BTC" },
      { key: "eth", label: "ETH", symbol: "ETH" }
    ]
  }
];

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const buildQuery = (definition: MarketDefinition) =>
  new URLSearchParams({
    symbols: definition.items.map((item) => item.symbol).join(",")
  }).toString();

const getEndpoint = (definition: MarketDefinition) =>
  definition.source === "OKX"
    ? `/api/okx/prices?${buildQuery(definition)}`
    : `/api/yahoo/prices?${buildQuery(definition)}${definition.source === "EASTMONEY" ? "&market=A_SHARE" : ""}`;

const toMarketItem = (
  definition: MarketDefinition,
  item: MarketDefinition["items"][number],
  payloadItem: NonNullable<PricePayload["prices"]>[number]
): GlobalMarketItem => {
  const previousClose = payloadItem.previousClose || payloadItem.currentPrice;
  const change = payloadItem.currentPrice - previousClose;

  return {
    key: item.key,
    label: item.label,
    symbol: item.symbol,
    currentPrice: round(payloadItem.currentPrice),
    previousClose: round(previousClose),
    change: round(change),
    changePercent: previousClose ? round((change / previousClose) * 100) : 0,
    source: definition.source,
    currency: payloadItem.currency
  };
};

const getMarketGroup = async (definition: MarketDefinition): Promise<GlobalMarketGroup> => {
  try {
    const response = await fetch(getEndpoint(definition));
    const payload = (await response.json()) as PricePayload;
    if (!response.ok) {
      throw new Error(payload.error || `${definition.label}行情读取失败`);
    }

    const prices = new Map((payload.prices ?? []).map((price) => [price.symbol.toUpperCase(), price]));
    const items = definition.items
      .map((item) => {
        const price = prices.get(item.symbol.toUpperCase());
        return price ? toMarketItem(definition, item, price) : null;
      })
      .filter((item): item is GlobalMarketItem => Boolean(item));

    if (!items.length) {
      throw new Error(`${definition.label}未返回有效行情`);
    }

    return {
      key: definition.key,
      label: definition.label,
      items,
      averageChangePercent: round(items.reduce((sum, item) => sum + item.changePercent, 0) / items.length)
    };
  } catch (error) {
    return {
      key: definition.key,
      label: definition.label,
      items: [],
      averageChangePercent: 0,
      error: error instanceof Error ? error.message : `${definition.label}行情读取失败`
    };
  }
};

export const getGlobalMarketSnapshot = async (): Promise<GlobalMarketSnapshot> => ({
  createdAt: new Date().toISOString(),
  groups: await Promise.all(marketDefinitions.map(getMarketGroup))
});
