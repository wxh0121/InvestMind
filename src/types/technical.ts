import type { AddAction } from "./analysis";

export type TechnicalBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED" | "UNAVAILABLE";

export interface TechnicalMetrics {
  close?: number;
  volume?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma50?: number;
  ma60?: number;
  ma120?: number;
  ma200?: number;
  ema12?: number;
  ema26?: number;
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bollingerMiddle?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
  bollingerBandwidth?: number;
  obv?: number;
  atr14?: number;
  atrPercent?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  adx14?: number;
}

export interface TechnicalHoldingAnalysis {
  holdingId: string;
  symbol: string;
  name: string;
  source: string;
  ok: boolean;
  action: AddAction;
  bias: TechnicalBias;
  score: number;
  reasons: string[];
  metrics: TechnicalMetrics;
  candleCount: number;
  updatedAt: string;
  error?: string;
}
