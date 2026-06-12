import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { HoldingAnalysis } from "../../src/types/analysis.js";
import type { AiAnalysisSummary } from "../../src/types/aiAnalysis.js";
import type { Holding } from "../../src/types/holding.js";
import type { TechnicalHoldingAnalysis } from "../../src/types/technical.js";
import { allowMethods, sendJson } from "../../lib/server/http.js";

interface AiSummaryRequestBody {
  holdings?: Holding[];
  ruleAnalyses?: HoldingAnalysis[];
  technicalAnalyses?: TechnicalHoldingAnalysis[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
  msg?: string;
}

const getGlmConfig = () => ({
  apiKey: process.env.GLM_API_KEY,
  baseUrl: (process.env.GLM_BASE_URL || "https://api.z.ai/api/paas/v4").replace(/\/$/, ""),
  model: process.env.GLM_MODEL || "glm-4.7-flash"
});

const compactNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : undefined;

const buildPrompt = ({
  holdings,
  ruleAnalyses,
  technicalAnalyses
}: Required<AiSummaryRequestBody>) => {
  const ruleById = new Map(ruleAnalyses.map((item) => [item.holdingId, item]));
  const technicalById = new Map(technicalAnalyses.map((item) => [item.holdingId, item]));
  const payload = holdings.map((holding) => {
    const rule = ruleById.get(holding.id);
    const technical = technicalById.get(holding.id);

    return {
      id: holding.id,
      name: holding.name,
      symbol: holding.symbol,
      market: holding.market,
      assetType: holding.assetType,
      currency: holding.currency,
      quantity: compactNumber(holding.quantity),
      currentPrice: compactNumber(holding.currentPrice),
      averageCost: compactNumber(holding.averageCost),
      marketValue: compactNumber(holding.marketValue),
      todayPnLPercent: compactNumber(holding.todayPnLPercent),
      totalPnLPercent: compactNumber(holding.totalPnLPercent),
      ruleAnalysis: rule
        ? {
            action: rule.action,
            addSuggestionPercent: rule.addSuggestionPercent,
            riskLevel: rule.riskLevel,
            reasons: rule.reasons,
            indicators: rule.indicators
          }
        : undefined,
      technicalAnalysis: technical
        ? {
            ok: technical.ok,
            action: technical.action,
            bias: technical.bias,
            score: technical.score,
            reasons: technical.reasons,
            metrics: technical.metrics
          }
        : undefined
    };
  });

  return `你是一个谨慎的个人资产记录助手，不提供确定性投资建议，只基于用户给出的持仓数据、本地规则分析和技术指标做风险提示与加减仓观察摘要。

请参考以下技术分析框架：
1. 趋势过滤：MA/SMA/EMA，价格站上 20 日均线、短期均线上穿长期均线偏多；跌破均线、死叉偏空。
2. 动量确认：RSI 14，低于 30 且回升是超卖修复；高于 70 且回落是超买降温。MACD 金叉/柱状图转正偏多，死叉/转负偏空。
3. 波动率辅助：布林带 20,2；触及下轨配合 RSI 超卖偏观察加仓，突破上轨偏过热。ATR 偏高时保守。
4. 成交量确认：OBV 上升确认趋势，下降提示趋势质量变弱。
5. 多指标共振优先，单一指标不得给出激进结论。

输出必须是 JSON，不要 markdown，不要代码块。结构如下：
{
  "overview": "组合整体摘要，80-160字",
  "items": [
    {
      "holdingId": "string",
      "symbol": "string",
      "name": "string",
      "action": "BUY_MORE|HOLD|REDUCE|WATCH",
      "confidence": "LOW|MEDIUM|HIGH",
      "summary": "单项摘要，40-90字",
      "keySignals": ["最多3条"],
      "risks": ["最多3条"]
    }
  ]
}

持仓数据如下：
${JSON.stringify(payload)}`;
};

const parseJsonContent = (content: string): Omit<AiAnalysisSummary, "model" | "createdAt" | "raw"> | null => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(jsonText) as Omit<AiAnalysisSummary, "model" | "createdAt" | "raw">;
  } catch {
    return null;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const { apiKey, baseUrl, model } = getGlmConfig();
  if (!apiKey) {
    sendJson(res, 400, { ok: false, error: "未配置 GLM_API_KEY，请先在 .env.local 或 Vercel 环境变量中设置" });
    return;
  }

  const body = req.body as AiSummaryRequestBody | undefined;
  const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
  const ruleAnalyses = Array.isArray(body?.ruleAnalyses) ? body.ruleAnalyses : [];
  const technicalAnalyses = Array.isArray(body?.technicalAnalyses) ? body.technicalAnalyses : [];
  if (!holdings.length) {
    sendJson(res, 400, { ok: false, error: "holdings is required" });
    return;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "zh-CN,zh",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是 InvestMind 的分析摘要助手。必须谨慎、简洁、基于输入数据，不承诺收益，不构成投资建议。"
        },
        {
          role: "user",
          content: buildPrompt({ holdings, ruleAnalyses, technicalAnalyses })
        }
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 2400
    })
  });

  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    sendJson(res, response.status, {
      ok: false,
      error: payload.error?.message || payload.msg || `GLM request failed with ${response.status}`
    });
    return;
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = parseJsonContent(content);
  const result: AiAnalysisSummary = parsed
    ? {
        overview: parsed.overview,
        items: parsed.items ?? [],
        model,
        createdAt: new Date().toISOString(),
        raw: content
      }
    : {
        overview: content || "GLM 已返回内容，但未能解析为结构化 JSON。",
        items: [],
        model,
        createdAt: new Date().toISOString(),
        raw: content
      };

  sendJson(res, 200, { ok: true, summary: result });
}
