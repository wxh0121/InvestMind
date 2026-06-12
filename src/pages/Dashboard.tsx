import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Briefcase,
  CircleDollarSign,
  PieChart,
  TrendingUp
} from "lucide-react";
import { AllocationPieChart } from "@/components/AllocationPieChart";
import { PnLBarChart } from "@/components/PnLBarChart";
import { RefreshButton } from "@/components/RefreshButton";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCard } from "@/components/SummaryCard";
import { usePortfolio } from "@/context/PortfolioContext";
import { MARKET_LABELS } from "@/types/holding";
import { convertCurrency } from "@/utils/calculations";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/utils/format";

const pnlTone = (value: number) => (value > 0 ? "profit" : value < 0 ? "loss" : "neutral");
const pnlTextClass = (value: number) =>
  value > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : value < 0
      ? "text-rose-600 dark:text-rose-300"
      : "text-slate-500 dark:text-slate-400";

export function Dashboard() {
  const { holdings, settings, summary, analyses, fxRates, fxUpdatedAt, loading } = usePortfolio();
  const fxUpdatedText = fxUpdatedAt
    ? new Date(fxUpdatedAt).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";
  const marketTodayPnL = holdings.reduce<Record<string, number>>((acc, holding) => {
    acc[holding.market] =
      (acc[holding.market] ?? 0) + convertCurrency(holding.todayPnL, holding.currency, fxRates);
    return acc;
  }, {});
  const topSuggestions = [...analyses]
    .filter((item) => item.addSuggestionPercent > 0)
    .sort((a, b) => b.addSuggestionPercent - a.addSuggestionPercent)
    .slice(0, 4);
  const chartData = holdings
    .slice()
    .sort(
      (a, b) =>
        Math.abs(convertCurrency(b.totalPnL, b.currency, fxRates)) -
        Math.abs(convertCurrency(a.totalPnL, a.currency, fxRates))
    )
    .slice(0, 8)
    .map((holding) => ({
      name: holding.symbol,
      todayPnL: convertCurrency(holding.todayPnL, holding.currency, fxRates),
      totalPnL: convertCurrency(holding.totalPnL, holding.currency, fxRates)
    }));

  if (loading) {
    return <div className="surface p-8 text-sm text-slate-500 dark:text-slate-400">加载中</div>;
  }

  return (
    <div className="space-y-6">
      <section className="surface overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl leading-none text-slate-950 dark:text-slate-50 sm:text-5xl">持仓总览</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {holdings.length} 项持仓 · 基础货币 {settings.baseCurrency}
              {fxUpdatedText ? ` · 汇率 ${fxUpdatedText}` : ""}
            </p>
          </div>
          <div className="flex justify-start sm:justify-end">
            <RefreshButton />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          title="总资产金额"
          value={formatCurrency(summary.totalMarketValue, settings.baseCurrency)}
          subtitle={`总持仓成本 ${formatCurrency(summary.totalCostValue, settings.baseCurrency)}`}
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone="accent"
        />
        <SummaryCard
          title="今日盈亏"
          value={formatCurrency(summary.todayPnL, settings.baseCurrency)}
          subtitle={formatPercent(summary.todayPnLPercent)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone={pnlTone(summary.todayPnL)}
        />
        <SummaryCard
          title="总浮动盈亏"
          value={formatCurrency(summary.totalPnL, settings.baseCurrency)}
          subtitle={formatPercent(summary.totalPnLPercent)}
          icon={<ArrowUpRight className="h-5 w-5" />}
          tone={pnlTone(summary.totalPnL)}
        />
        <SummaryCard
          title="资产市场数"
          value={`${summary.allocationByMarket.length}`}
          subtitle="已配置市场"
          icon={<PieChart className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AllocationPieChart title="市场资产占比" data={summary.allocationByMarket} currency={settings.baseCurrency} />
        <AllocationPieChart title="资产类型占比" data={summary.allocationByAssetType} currency={settings.baseCurrency} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <PnLBarChart title="盈亏分布" data={chartData} currency={settings.baseCurrency} />
        <section className="surface p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">加仓建议摘要</h2>
            <Link className="text-sm font-medium text-coral-700 dark:text-coral-300" to="/analysis">
              查看全部
            </Link>
          </div>
          <div className="space-y-3">
            {topSuggestions.length ? (
              topSuggestions.map((item) => (
                <div
                  key={item.holdingId}
                  className="surface-hover rounded-lg border border-slate-100 bg-[#FFFDF8] p-3 transition duration-200 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-50">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.symbol}</p>
                    </div>
                    <StatusBadge tone="accent">建议 {item.addSuggestionPercent}%</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.reasons[0]}</p>
                </div>
              ))
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                暂无加仓建议
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.allocationByMarket.map((entry) => (
          <div key={entry.key} className="surface surface-hover p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{MARKET_LABELS[entry.key]}</p>
                <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
                  {formatCompactCurrency(entry.value, settings.baseCurrency)}
                </p>
              </div>
              <Briefcase className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-lg bg-coral-600" style={{ width: `${Math.min(entry.percent, 100)}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">占比 {formatPercent(entry.percent)}</span>
              <span className={pnlTextClass(marketTodayPnL[entry.key] ?? 0)}>
                今日 {formatCurrency(marketTodayPnL[entry.key] ?? 0, settings.baseCurrency)}
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
