export type Market =
  | "CASH"
  | "A_SHARE"
  | "HK_STOCK"
  | "US_STOCK"
  | "CRYPTO"
  | "ASIA_PACIFIC"
  | "EUROPE";

export type AssetType =
  | "STOCK"
  | "CRYPTO"
  | "CASH"
  | "INDEX_FUND"
  | "SECTOR_FUND";

export type Currency = "CNY" | "USD" | "HKD" | "EUR" | "JPY" | "SGD" | "OTHER";

export type DataSource = "MANUAL" | "OKX" | "YAHOO" | "EASTMONEY";

export interface Holding {
  id: string;
  name: string;
  symbol: string;
  market: Market;
  assetType: AssetType;
  currency: Currency;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  previousClose: number;
  marketValue: number;
  costValue: number;
  todayPnL: number;
  todayPnLPercent: number;
  totalPnL: number;
  totalPnLPercent: number;
  dataSource: DataSource;
  lastUpdated: string;
  note?: string;
}

export type HoldingDraft = Omit<
  Holding,
  | "id"
  | "marketValue"
  | "costValue"
  | "todayPnL"
  | "todayPnLPercent"
  | "totalPnL"
  | "totalPnLPercent"
  | "lastUpdated"
> & {
  id?: string;
};

export const MARKET_LABELS: Record<Market, string> = {
  CASH: "现金",
  A_SHARE: "A 股",
  HK_STOCK: "港股",
  US_STOCK: "美股",
  CRYPTO: "加密",
  ASIA_PACIFIC: "亚太",
  EUROPE: "欧洲"
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "个股",
  CRYPTO: "加密",
  CASH: "现金",
  INDEX_FUND: "指数基金",
  SECTOR_FUND: "板块基金"
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  MANUAL: "手动录入",
  OKX: "OKX",
  YAHOO: "Yahoo Finance",
  EASTMONEY: "天天基金/东财基金"
};

export const MARKETS: Array<{ value: Market; label: string }> = Object.entries(MARKET_LABELS).map(
  ([value, label]) => ({ value: value as Market, label })
);

export const ASSET_TYPES: Array<{ value: AssetType; label: string }> = Object.entries(
  ASSET_TYPE_LABELS
).map(([value, label]) => ({ value: value as AssetType, label }));

export const CURRENCIES: Currency[] = ["CNY", "USD", "HKD", "EUR", "JPY", "SGD", "OTHER"];

export const DATA_SOURCES: DataSource[] = ["MANUAL", "OKX", "YAHOO", "EASTMONEY"];
