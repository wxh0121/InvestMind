import type { Holding } from "@/types/holding";
import type { TechnicalHoldingAnalysis } from "@/types/technical";

interface TechnicalAnalysisResponse {
  ok: boolean;
  analyses: TechnicalHoldingAnalysis[];
  error?: string;
}

export const getTechnicalAnalyses = async (holdings: Holding[]) => {
  const response = await fetch("/api/analysis/technical", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ holdings })
  });
  const payload = (await response.json()) as TechnicalAnalysisResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "技术指标分析失败");
  }

  return payload.analyses;
};
