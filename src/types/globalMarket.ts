export type GlobalMarketGroupKey =
  | "A_SHARE"
  | "HK_STOCK"
  | "US_STOCK"
  | "JAPAN_KOREA"
  | "EUROPE"
  | "CRYPTO";

export interface GlobalMarketItem {
  key: string;
  label: string;
  symbol: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  source: "YAHOO" | "OKX" | "EASTMONEY" | "TENCENT" | "SINA";
  currency?: string;
}

export interface GlobalMarketGroup {
  key: GlobalMarketGroupKey;
  label: string;
  items: GlobalMarketItem[];
  averageChangePercent: number;
  error?: string;
}

export interface GlobalMarketSnapshot {
  createdAt: string;
  groups: GlobalMarketGroup[];
}
