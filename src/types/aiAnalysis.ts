import type { AddAction } from "./analysis";

export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface AiHoldingSummary {
  holdingId: string;
  symbol: string;
  name: string;
  action: AddAction;
  confidence: AiConfidence;
  summary: string;
  keySignals: string[];
  risks: string[];
}

export interface AiAnalysisSummary {
  overview: string;
  items: AiHoldingSummary[];
  model: string;
  createdAt: string;
  raw?: string;
}
