export type AddAction = "BUY_MORE" | "HOLD" | "REDUCE" | "WATCH";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AnalysisIndicator {
  label: string;
  value: string;
}

export interface HoldingAnalysis {
  holdingId: string;
  symbol: string;
  name: string;
  action: AddAction;
  addSuggestionPercent: number;
  riskLevel: RiskLevel;
  reasons: string[];
  indicators: AnalysisIndicator[];
  currentAllocationPercent: number;
  targetAllocationPercent: number;
  singleAssetPercent: number;
}
