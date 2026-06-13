import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Globe2, LineChart, RefreshCcw, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/context/PortfolioContext";
import { getAiAnalysisSummary, type AiAnalysisMode } from "@/services/aiAnalysisService";
import { getGlobalMarketSnapshot } from "@/services/globalMarketService";
import { getTechnicalAnalyses } from "@/services/technicalAnalysisService";
import type { AddAction } from "@/types/analysis";
import type { AiAnalysisSummary } from "@/types/aiAnalysis";
import type { GlobalMarketGroup, GlobalMarketItem, GlobalMarketSnapshot } from "@/types/globalMarket";
import type { Holding } from "@/types/holding";
import type { TechnicalHoldingAnalysis } from "@/types/technical";
import { cn, formatPercent } from "@/utils/format";

const actionLabel: Record<AddAction, string> = {
  BUY_MORE: "可加仓",
  HOLD: "持有",
  REDUCE: "降权",
  WATCH: "观察"
};

const actionTone = (action: AddAction) => {
  if (action === "BUY_MORE") return "profit";
  if (action === "REDUCE") return "loss";
  if (action === "WATCH") return "warning";
  return "neutral";
};

const isTechnicalCandidate = (holding: Holding) =>
  (holding.assetType === "STOCK" || holding.assetType === "CRYPTO" || holding.market === "CRYPTO") &&
  (holding.dataSource === "YAHOO" || holding.dataSource === "OKX");

const metricText = (value?: number, suffix = "") =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("zh-CN")}${suffix}` : "-";

const signedNumber = (value: number) => {
  const normalized = Number.isFinite(value) ? value : 0;
  return `${normalized > 0 ? "+" : ""}${normalized.toLocaleString("zh-CN", {
    maximumFractionDigits: 2
  })}`;
};

const signedPercent = (value: number) => {
  const normalized = Number.isFinite(value) ? value : 0;
  return `${normalized > 0 ? "+" : ""}${formatPercent(normalized)}`;
};

const pnlClass = (value: number) =>
  value > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : value < 0
      ? "text-rose-600 dark:text-rose-300"
      : "text-slate-500 dark:text-slate-400";

function MarketItemLine({ item }: { item: GlobalMarketItem }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-slate-600 dark:text-slate-300">{item.label}</span>
      <span className={cn("shrink-0 font-medium", pnlClass(item.change))}>
        {signedNumber(item.change)} · {signedPercent(item.changePercent)}
      </span>
    </div>
  );
}

function GlobalMarketGroupCard({ group }: { group: GlobalMarketGroup }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{group.label}</p>
        <span className={cn("text-sm font-semibold", pnlClass(group.averageChangePercent))}>
          {group.items.length ? signedPercent(group.averageChangePercent) : "-"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {group.items.length ? (
          group.items.map((item) => <MarketItemLine key={item.key} item={item} />)
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{group.error ?? "行情暂不可用"}</p>
        )}
      </div>
    </div>
  );
}

function buildGlobalMarketSummary(snapshot: GlobalMarketSnapshot | null) {
  if (!snapshot) return "等待读取今日全球行情。";
  const availableGroups = snapshot.groups.filter((group) => group.items.length);
  if (!availableGroups.length) return "全球行情暂不可用。";

  const strongest = [...availableGroups].sort(
    (first, second) => second.averageChangePercent - first.averageChangePercent
  )[0];
  const weakest = [...availableGroups].sort(
    (first, second) => first.averageChangePercent - second.averageChangePercent
  )[0];
  const overview = availableGroups
    .map((group) => `${group.label}${signedPercent(group.averageChangePercent)}`)
    .join("，");

  return `今日概览：${overview}。相对强势：${strongest.label}；相对承压：${weakest.label}。`;
}

function GlobalMarketSection({
  snapshot,
  loading,
  error,
  onRefresh
}: {
  snapshot: GlobalMarketSnapshot | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section className="surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-coral-600 dark:text-coral-300" />
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">全球行情</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {buildGlobalMarketSummary(snapshot)}
          </p>
        </div>
        <button className="btn-secondary" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          刷新行情
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      {snapshot ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.groups.map((group) => (
            <GlobalMarketGroupCard key={group.key} group={group} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TechnicalCard({ technical }: { technical: TechnicalHoldingAnalysis }) {
  return (
    <article className="surface surface-hover min-w-0 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-950 dark:text-slate-50">
            {technical.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{technical.symbol}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={actionTone(technical.action)}>{actionLabel[technical.action]}</StatusBadge>
          <StatusBadge tone={technical.score > 0 ? "profit" : technical.score < 0 ? "loss" : "neutral"}>
            评分 {technical.score}
          </StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900">
          MA20 {metricText(technical.metrics.ma20)}
        </span>
        <span className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900">
          RSI {metricText(technical.metrics.rsi14)}
        </span>
        <span className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900">
          MACD {metricText(technical.metrics.macdHistogram)}
        </span>
        <span className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900">
          ATR {metricText(technical.metrics.atrPercent, "%")}
        </span>
      </div>

      <div className="mt-4 space-y-1.5">
        {technical.reasons.slice(0, 4).map((reason) => (
          <p key={reason} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {reason}
          </p>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {technical.candleCount} 根K线 · {new Date(technical.updatedAt).toLocaleString("zh-CN")}
      </p>
    </article>
  );
}

export function Analysis() {
  const { holdings, analyses } = usePortfolio();
  const [technicalAnalyses, setTechnicalAnalyses] = useState<TechnicalHoldingAnalysis[]>([]);
  const [technicalLoading, setTechnicalLoading] = useState(false);
  const [technicalError, setTechnicalError] = useState("");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [globalMarkets, setGlobalMarkets] = useState<GlobalMarketSnapshot | null>(null);
  const [globalMarketLoading, setGlobalMarketLoading] = useState(false);
  const [globalMarketError, setGlobalMarketError] = useState("");
  const [aiMode, setAiMode] = useState<AiAnalysisMode>("MARKET");
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [aiSummary, setAiSummary] = useState<AiAnalysisSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const technicalCandidates = useMemo(() => holdings.filter(isTechnicalCandidate), [holdings]);
  const availableTechnicals = useMemo(
    () => technicalAnalyses.filter((item) => item.ok).sort((first, second) => first.name.localeCompare(second.name)),
    [technicalAnalyses]
  );
  const technicalByHolding = useMemo(
    () => new Map(availableTechnicals.map((item) => [item.holdingId, item])),
    [availableTechnicals]
  );
  const holdingById = useMemo(() => new Map(holdings.map((holding) => [holding.id, holding])), [holdings]);
  const analysisByHolding = useMemo(() => new Map(analyses.map((item) => [item.holdingId, item])), [analyses]);

  const loadTechnicals = useCallback(async () => {
    if (!technicalCandidates.length) {
      setTechnicalAnalyses([]);
      setSelectedHoldingId("");
      return;
    }

    setTechnicalLoading(true);
    setTechnicalError("");
    try {
      setTechnicalAnalyses(await getTechnicalAnalyses(technicalCandidates));
    } catch (error) {
      setTechnicalError(error instanceof Error ? error.message : "技术指标分析失败");
    } finally {
      setTechnicalLoading(false);
    }
  }, [technicalCandidates]);

  const loadGlobalMarkets = useCallback(async () => {
    setGlobalMarketLoading(true);
    setGlobalMarketError("");
    try {
      setGlobalMarkets(await getGlobalMarketSnapshot());
    } catch (error) {
      setGlobalMarketError(error instanceof Error ? error.message : "全球行情读取失败");
    } finally {
      setGlobalMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTechnicals();
  }, [loadTechnicals]);

  useEffect(() => {
    void loadGlobalMarkets();
  }, [loadGlobalMarkets]);

  useEffect(() => {
    if (!availableTechnicals.length) {
      setSelectedHoldingId("");
      return;
    }
    if (!availableTechnicals.some((item) => item.holdingId === selectedHoldingId)) {
      setSelectedHoldingId(availableTechnicals[0].holdingId);
    }
  }, [availableTechnicals, selectedHoldingId]);

  const selectAiMode = (mode: AiAnalysisMode) => {
    setAiMode(mode);
    setAiSummary(null);
    setAiError("");
  };

  const loadAiSummary = async () => {
    setAiLoading(true);
    setAiError("");
    setAiSummary(null);

    try {
      if (aiMode === "MARKET") {
        const snapshot = globalMarkets ?? (await getGlobalMarketSnapshot());
        setGlobalMarkets(snapshot);
        setAiSummary(await getAiAnalysisSummary({ mode: "MARKET", globalMarkets: snapshot }));
        return;
      }

      const technical = technicalByHolding.get(selectedHoldingId);
      const holding = holdingById.get(selectedHoldingId);
      if (!technical || !holding) {
        throw new Error("请选择一个有技术指标的资产");
      }

      setAiSummary(
        await getAiAnalysisSummary({
          mode: "HOLDING",
          holding,
          ruleAnalysis: analysisByHolding.get(selectedHoldingId),
          technicalAnalysis: technical
        })
      );
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 摘要生成失败");
    } finally {
      setAiLoading(false);
    }
  };

  const selectedAiItem = aiSummary?.items?.[0];

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

      <GlobalMarketSection
        snapshot={globalMarkets}
        loading={globalMarketLoading}
        error={globalMarketError}
        onRefresh={loadGlobalMarkets}
      />

      <section className="surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-coral-600 dark:text-coral-300" />
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">GLM 分析摘要</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              大盘分析读取全球行情；个股分析只读取所选资产的技术指标。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2">
              {(["MARKET", "HOLDING"] as AiAnalysisMode[]).map((mode) => (
                <button
                  key={mode}
                  className={cn(
                    "h-9 rounded-lg px-3 text-sm font-medium transition",
                    aiMode === mode
                      ? "bg-[#FFFDF8] text-slate-950 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                      : "text-slate-600 hover:bg-[#FFFDF8]/70 dark:text-slate-300 dark:hover:bg-slate-900/70"
                  )}
                  type="button"
                  onClick={() => selectAiMode(mode)}
                >
                  {mode === "MARKET" ? "大盘分析" : "个股分析"}
                </button>
              ))}
            </div>

            {aiMode === "HOLDING" ? (
              <select
                className="input h-10 min-w-44"
                value={selectedHoldingId}
                onChange={(event) => {
                  setSelectedHoldingId(event.target.value);
                  setAiSummary(null);
                  setAiError("");
                }}
              >
                {availableTechnicals.map((technical) => (
                  <option key={technical.holdingId} value={technical.holdingId}>
                    {technical.name} · {technical.symbol}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              className="btn-primary"
              type="button"
              onClick={loadAiSummary}
              disabled={aiLoading || (aiMode === "HOLDING" && !selectedHoldingId)}
            >
              <Sparkles className={cn("h-4 w-4", aiLoading && "animate-pulse")} />
              {aiLoading ? "生成中" : "生成摘要"}
            </button>
          </div>
        </div>

        {aiSummary ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{aiSummary.overview}</p>
            {selectedAiItem ? (
              <div className="mt-3 rounded-lg border border-coral-200 bg-coral-50 p-3 dark:border-coral-900 dark:bg-coral-950">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={actionTone(selectedAiItem.action)}>
                    GLM {actionLabel[selectedAiItem.action]}
                  </StatusBadge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    置信度 {selectedAiItem.confidence}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {selectedAiItem.summary}
                </p>
                {selectedAiItem.keySignals.length ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    信号：{selectedAiItem.keySignals.join("；")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              模型 {aiSummary.model} · {new Date(aiSummary.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
        ) : null}
        {aiError ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{aiError}</p> : null}
      </section>

      {technicalError ? <p className="text-sm text-rose-600 dark:text-rose-300">{technicalError}</p> : null}

      <section className="surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-coral-600 dark:text-coral-300" />
              <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">技术指标细节分析</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {availableTechnicals.length} / {technicalCandidates.length} 项资产有可用技术指标
            </p>
          </div>
          <button
            className="btn-secondary h-9 shrink-0 gap-1.5 px-3 text-sm"
            type="button"
            aria-expanded={technicalOpen}
            onClick={() => setTechnicalOpen((current) => !current)}
          >
            具体指标
            <ChevronDown className={cn("h-4 w-4 transition-transform", technicalOpen && "rotate-180")} />
          </button>
        </div>

        {technicalOpen ? (
          availableTechnicals.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {availableTechnicals.map((technical) => (
                <TechnicalCard key={technical.holdingId} technical={technical} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              暂无可用技术指标资产
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
