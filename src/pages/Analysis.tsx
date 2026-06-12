import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, LineChart, RefreshCcw, ShieldAlert, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/context/PortfolioContext";
import { getAiAnalysisSummary } from "@/services/aiAnalysisService";
import { getTechnicalAnalyses } from "@/services/technicalAnalysisService";
import type { AddAction, RiskLevel } from "@/types/analysis";
import type { AiAnalysisSummary } from "@/types/aiAnalysis";
import type { TechnicalHoldingAnalysis } from "@/types/technical";
import { cn } from "@/utils/format";
import { formatPercent } from "@/utils/format";

const actionLabel: Record<AddAction, string> = {
  BUY_MORE: "可加仓",
  HOLD: "持有",
  REDUCE: "降权",
  WATCH: "观察"
};

const riskLabel: Record<RiskLevel, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高"
};

const actionTone = (action: AddAction) => {
  if (action === "BUY_MORE") return "profit";
  if (action === "REDUCE") return "loss";
  if (action === "WATCH") return "warning";
  return "neutral";
};

const RiskIcon = ({ risk }: { risk: RiskLevel }) => {
  if (risk === "HIGH") return <ShieldAlert className="h-4 w-4" />;
  if (risk === "MEDIUM") return <AlertTriangle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
};

const metricText = (value?: number, suffix = "") =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("zh-CN")}${suffix}` : "-";

export function Analysis() {
  const { holdings, analyses } = usePortfolio();
  const [technicalAnalyses, setTechnicalAnalyses] = useState<TechnicalHoldingAnalysis[]>([]);
  const [technicalLoading, setTechnicalLoading] = useState(false);
  const [technicalError, setTechnicalError] = useState("");
  const [aiSummary, setAiSummary] = useState<AiAnalysisSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const sorted = [...analyses].sort((a, b) => b.addSuggestionPercent - a.addSuggestionPercent);
  const technicalByHolding = useMemo(
    () => new Map(technicalAnalyses.map((item) => [item.holdingId, item])),
    [technicalAnalyses]
  );
  const aiByHolding = useMemo(
    () => new Map((aiSummary?.items ?? []).map((item) => [item.holdingId, item])),
    [aiSummary]
  );

  const loadTechnicals = useCallback(async () => {
    if (!holdings.length) {
      setTechnicalAnalyses([]);
      return;
    }

    setTechnicalLoading(true);
    setTechnicalError("");
    try {
      setTechnicalAnalyses(await getTechnicalAnalyses(holdings));
    } catch (error) {
      setTechnicalError(error instanceof Error ? error.message : "技术指标分析失败");
    } finally {
      setTechnicalLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    void loadTechnicals();
  }, [loadTechnicals]);

  const loadAiSummary = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      setAiSummary(await getAiAnalysisSummary(holdings, analyses, technicalAnalyses));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 摘要生成失败");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">加仓分析</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            本工具仅用于个人资产记录与规则化分析，不构成任何投资建议。投资有风险，决策需谨慎。
          </p>
        </div>
        <button className="btn-secondary" type="button" onClick={loadTechnicals} disabled={technicalLoading}>
          <RefreshCcw className={cn("h-4 w-4", technicalLoading && "animate-spin")} />
          刷新技术指标
        </button>
      </div>

      <section className="surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-coral-600 dark:text-coral-300" />
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">GLM 持仓摘要</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              结合本地配置规则、MA/RSI/MACD/布林带/OBV/KDJ/ATR/ADX 等指标生成摘要。
            </p>
          </div>
          <button className="btn-primary" type="button" onClick={loadAiSummary} disabled={aiLoading || !holdings.length}>
            <Sparkles className={cn("h-4 w-4", aiLoading && "animate-pulse")} />
            {aiLoading ? "生成中" : "生成摘要"}
          </button>
        </div>
        {aiSummary ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{aiSummary.overview}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              模型 {aiSummary.model} · {new Date(aiSummary.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
        ) : null}
        {aiError ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{aiError}</p> : null}
      </section>

      {technicalError ? <p className="text-sm text-rose-600 dark:text-rose-300">{technicalError}</p> : null}

      {sorted.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((item) => {
            const technical = technicalByHolding.get(item.holdingId);
            const aiItem = aiByHolding.get(item.holdingId);

            return (
              <section key={item.holdingId} className="surface surface-hover p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{item.name}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.symbol}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={actionTone(item.action)}>{actionLabel[item.action]}</StatusBadge>
                    {technical ? (
                      <StatusBadge tone={actionTone(technical.action)}>技术 {actionLabel[technical.action]}</StatusBadge>
                    ) : null}
                    <StatusBadge tone={item.riskLevel === "HIGH" ? "loss" : item.riskLevel === "MEDIUM" ? "warning" : "profit"}>
                      <RiskIcon risk={item.riskLevel} />
                      风险 {riskLabel[item.riskLevel]}
                    </StatusBadge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="label">建议加仓比例</p>
                    <p className="mt-1 text-xl font-semibold text-coral-700 dark:text-coral-300">
                      {item.addSuggestionPercent}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="label">当前市场配置</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
                      {formatPercent(item.currentAllocationPercent)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="label">目标市场配置</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
                      {formatPercent(item.targetAllocationPercent)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {item.reasons.map((reason) => (
                    <div key={reason} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-coral-600 dark:text-coral-300" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>

                {technical ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LineChart className="h-4 w-4 text-coral-600 dark:text-coral-300" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">技术指标</p>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {technical.ok ? `${technical.candleCount} 根K线 · 评分 ${technical.score}` : "不可用"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <span className="rounded-lg bg-[#FFFDF8] px-2 py-1.5 dark:bg-slate-950">
                        MA20 {metricText(technical.metrics.ma20)}
                      </span>
                      <span className="rounded-lg bg-[#FFFDF8] px-2 py-1.5 dark:bg-slate-950">
                        RSI {metricText(technical.metrics.rsi14)}
                      </span>
                      <span className="rounded-lg bg-[#FFFDF8] px-2 py-1.5 dark:bg-slate-950">
                        MACD {metricText(technical.metrics.macdHistogram)}
                      </span>
                      <span className="rounded-lg bg-[#FFFDF8] px-2 py-1.5 dark:bg-slate-950">
                        ATR {metricText(technical.metrics.atrPercent, "%")}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {technical.reasons.slice(0, 3).map((reason) => (
                        <p key={reason} className="text-sm text-slate-600 dark:text-slate-300">
                          {reason}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {aiItem ? (
                  <div className="mt-4 rounded-lg border border-coral-200 bg-coral-50 p-3 dark:border-coral-900 dark:bg-coral-950">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={actionTone(aiItem.action)}>GLM {actionLabel[aiItem.action]}</StatusBadge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">置信度 {aiItem.confidence}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{aiItem.summary}</p>
                    {aiItem.keySignals.length ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        信号：{aiItem.keySignals.join("；")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.indicators.map((indicator) => (
                    <span
                      key={indicator.label}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300"
                    >
                      {indicator.label}: {indicator.value}
                    </span>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="surface flex min-h-60 items-center justify-center p-8 text-sm text-slate-500 dark:text-slate-400">
          暂无持仓可分析
        </section>
      )}
    </div>
  );
}
