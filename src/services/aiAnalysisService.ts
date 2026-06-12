import type { HoldingAnalysis } from "@/types/analysis";
import type { AiAnalysisSummary } from "@/types/aiAnalysis";
import type { Holding } from "@/types/holding";
import type { TechnicalHoldingAnalysis } from "@/types/technical";

interface AiAnalysisResponse {
  ok: boolean;
  summary?: AiAnalysisSummary;
  error?: string;
}

export const getAiAnalysisSummary = async (
  holdings: Holding[],
  ruleAnalyses: HoldingAnalysis[],
  technicalAnalyses: TechnicalHoldingAnalysis[]
) => {
  const response = await fetch("/api/analysis/ai-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      holdings,
      ruleAnalyses,
      technicalAnalyses
    })
  });
  const payload = (await response.json()) as AiAnalysisResponse;

  if (!response.ok || !payload.ok || !payload.summary) {
    throw new Error(payload.error || "AI 摘要生成失败");
  }

  return payload.summary;
};
