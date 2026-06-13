import type { HoldingAnalysis } from "@/types/analysis";
import type { AiAnalysisSummary } from "@/types/aiAnalysis";
import type { GlobalMarketSnapshot } from "@/types/globalMarket";
import type { Holding } from "@/types/holding";
import type { TechnicalHoldingAnalysis } from "@/types/technical";

export type AiAnalysisMode = "MARKET" | "HOLDING";

interface AiAnalysisRequest {
  mode: AiAnalysisMode;
  globalMarkets?: GlobalMarketSnapshot;
  holding?: Holding;
  ruleAnalysis?: HoldingAnalysis;
  technicalAnalysis?: TechnicalHoldingAnalysis;
}

interface AiAnalysisResponse {
  ok: boolean;
  summary?: AiAnalysisSummary;
  error?: string;
}

export const getAiAnalysisSummary = async (request: AiAnalysisRequest) => {
  const response = await fetch("/api/analysis/ai-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const payload = (await response.json()) as AiAnalysisResponse;

  if (!response.ok || !payload.ok || !payload.summary) {
    throw new Error(payload.error || "AI 摘要生成失败");
  }

  return payload.summary;
};
