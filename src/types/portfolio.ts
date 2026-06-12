import type { AssetType, Currency, Holding, Market } from "./holding";

export interface AllocationEntry<T extends string = string> {
  key: T;
  label: string;
  value: number;
  percent: number;
}

export interface PortfolioSummary {
  totalMarketValue: number;
  totalCostValue: number;
  todayPnL: number;
  todayPnLPercent: number;
  totalPnL: number;
  totalPnLPercent: number;
  allocationByMarket: Array<AllocationEntry<Market>>;
  allocationByAssetType: Array<AllocationEntry<AssetType>>;
}

export type CurrencyRateMap = Partial<Record<Currency, number>>;

export interface FxRates {
  baseCurrency: Currency;
  rates: CurrencyRateMap;
  updatedAt?: string;
}

export interface PortfolioSnapshot {
  id: string;
  createdAt: string;
  totalMarketValue: number;
  totalCostValue: number;
  todayPnL: number;
  totalPnL: number;
  holdings: Holding[];
  allocationByMarket: Array<AllocationEntry<Market>>;
  allocationByAssetType: Array<AllocationEntry<AssetType>>;
}

export interface PriceUpdate {
  symbol: string;
  currentPrice: number;
  previousClose?: number;
  quantity?: number;
  source: "OKX" | "YAHOO" | "EASTMONEY" | "MANUAL";
  currency?: string;
  error?: string;
}

export interface RefreshResponse {
  ok: boolean;
  updatedAt: string;
  updates: PriceUpdate[];
  errors: Array<{ symbol?: string; source?: string; message: string }>;
}
