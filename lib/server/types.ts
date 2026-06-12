export type ApiSource = "OKX" | "YAHOO" | "EASTMONEY";

export interface NormalizedBalance {
  symbol: string;
  quantity: number;
  currency: string;
}

export interface NormalizedPrice {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  currency: string;
}

export interface NormalizedUpdate extends NormalizedPrice {
  quantity?: number;
  source: ApiSource;
}

export interface HistoricalCandle {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface RefreshHoldingInput {
  id: string;
  symbol: string;
  market: string;
  dataSource: string;
}
