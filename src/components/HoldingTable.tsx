import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import {
  ASSET_TYPE_LABELS,
  CURRENCIES,
  DATA_SOURCE_LABELS,
  MARKET_LABELS,
  MARKETS,
  type Currency,
  type Market,
  type Holding
} from "@/types/holding";
import { formatCurrency, formatDateTime, formatPercent } from "@/utils/format";

interface HoldingTableProps {
  holdings: Holding[];
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
}

const pnlClass = (value: number) =>
  value > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : value < 0
      ? "text-rose-600 dark:text-rose-300"
      : "text-slate-500 dark:text-slate-400";

const marketOrder = MARKETS.map((item) => item.value);
const currencyOrder = CURRENCIES;

interface CurrencyTotal {
  currency: Currency;
  value: number;
}

const groupHoldingsByMarket = (holdings: Holding[]) => {
  const grouped = new Map<Market, Holding[]>();

  holdings.forEach((holding) => {
    const marketHoldings = grouped.get(holding.market);
    if (marketHoldings) {
      marketHoldings.push(holding);
      return;
    }

    grouped.set(holding.market, [holding]);
  });

  return Array.from(grouped.entries()).sort(([first], [second]) => {
    const firstIndex = marketOrder.indexOf(first);
    const secondIndex = marketOrder.indexOf(second);
    const normalizedFirstIndex = firstIndex === -1 ? marketOrder.length : firstIndex;
    const normalizedSecondIndex = secondIndex === -1 ? marketOrder.length : secondIndex;

    return normalizedFirstIndex - normalizedSecondIndex;
  });
};

const isCashHolding = (holding: Holding) => holding.market === "CASH" || holding.assetType === "CASH";

const sumByCurrency = (holdings: Holding[], getValue: (holding: Holding) => number): CurrencyTotal[] => {
  const totals = new Map<Currency, number>();

  holdings.forEach((holding) => {
    totals.set(holding.currency, (totals.get(holding.currency) ?? 0) + getValue(holding));
  });

  return Array.from(totals.entries())
    .map(([currency, value]) => ({ currency, value }))
    .sort((first, second) => currencyOrder.indexOf(first.currency) - currencyOrder.indexOf(second.currency));
};

function SummaryValue({ totals, pnl = false }: { totals: CurrencyTotal[]; pnl?: boolean }) {
  return (
    <div className="mt-1 space-y-1">
      {totals.map((total) => (
        <p
          key={total.currency}
          className={`truncate text-sm font-semibold ${pnl ? pnlClass(total.value) : "text-slate-950 dark:text-slate-50"}`}
        >
          {formatCurrency(total.value, total.currency)}
        </p>
      ))}
    </div>
  );
}

function MarketSummary({ holdings }: { holdings: Holding[] }) {
  const marketValueTotals = sumByCurrency(holdings, (holding) => holding.marketValue);
  const todayPnLTotals = sumByCurrency(holdings, (holding) => holding.todayPnL);
  const totalPnLTotals = sumByCurrency(holdings, (holding) => holding.totalPnL);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <p className="label">总市值</p>
        <SummaryValue totals={marketValueTotals} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <p className="label">当日总盈亏</p>
        <SummaryValue totals={todayPnLTotals} pnl />
      </div>
      <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <p className="label">历史总盈亏</p>
        <SummaryValue totals={totalPnLTotals} pnl />
      </div>
    </div>
  );
}

function CashMarketSummary({ holdings }: { holdings: Holding[] }) {
  const marketValueTotals = sumByCurrency(holdings, (holding) => holding.marketValue);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <p className="label">总市值</p>
        <SummaryValue totals={marketValueTotals} />
      </div>
    </div>
  );
}

function HoldingActions({
  holding,
  onEdit,
  onDelete
}: {
  holding: Holding;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        className="btn-secondary h-9 w-9 px-0"
        type="button"
        onClick={() => onEdit(holding)}
        aria-label={`编辑 ${holding.name}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        className="btn-danger h-9 w-9 px-0"
        type="button"
        onClick={() => onDelete(holding)}
        aria-label={`删除 ${holding.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function CashHoldingCard({
  holding,
  onEdit,
  onDelete
}: {
  holding: Holding;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
}) {
  return (
    <article className="surface surface-hover flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{holding.name}</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{holding.currency} · 现金</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="min-w-0 sm:min-w-36 sm:text-right">
          <p className="label">市值</p>
          <p className="mt-1 truncate text-base font-semibold text-slate-950 dark:text-slate-50">
            {formatCurrency(holding.marketValue, holding.currency)}
          </p>
        </div>
        <HoldingActions holding={holding} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  );
}

export function HoldingTable({ holdings, onEdit, onDelete }: HoldingTableProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<Set<Market>>(() => new Set());

  const toggleMarket = (market: Market) => {
    setExpandedMarkets((current) => {
      const next = new Set(current);
      if (next.has(market)) {
        next.delete(market);
      } else {
        next.add(market);
      }
      return next;
    });
  };

  if (!holdings.length) {
    return (
      <section className="surface p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        暂无持仓
      </section>
    );
  }

  const groupedHoldings = groupHoldingsByMarket(holdings);

  return (
    <div className="space-y-4">
      {groupedHoldings.map(([market, marketHoldings]) => {
        const isCashMarket = market === "CASH";
        const expanded = expandedMarkets.has(market);
        const detailsId = `holding-market-${market}`;

        return (
          <section
            key={market}
            className="rounded-xl border border-slate-200/80 bg-[#FFFDF8]/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                  {MARKET_LABELS[market]}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {marketHoldings.length} 项持仓
                </p>
              </div>
              <button
                className="btn-secondary h-9 shrink-0 gap-1.5 px-3 text-sm"
                type="button"
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={() => toggleMarket(market)}
              >
                具体持仓
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            <div className="mt-3">
              {isCashMarket ? <CashMarketSummary holdings={marketHoldings} /> : <MarketSummary holdings={marketHoldings} />}
            </div>

            {expanded ? (
              <div
                id={detailsId}
                className={`mt-3 ${isCashMarket ? "grid gap-2" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}`}
              >
                {marketHoldings.map((holding) =>
                  isCashHolding(holding) ? (
                    <CashHoldingCard key={holding.id} holding={holding} onEdit={onEdit} onDelete={onDelete} />
                  ) : (
                    <article key={holding.id} className="surface surface-hover min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-950 dark:text-slate-50">
                            {holding.name}
                          </h3>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {holding.symbol} · {ASSET_TYPE_LABELS[holding.assetType]}
                          </p>
                        </div>
                        <HoldingActions holding={holding} onEdit={onEdit} onDelete={onDelete} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                          <p className="label">今日盈亏</p>
                          <p className={`mt-2 truncate text-base font-semibold ${pnlClass(holding.todayPnL)}`}>
                            {formatCurrency(holding.todayPnL, holding.currency)}
                          </p>
                          <p className={`mt-1 text-xs ${pnlClass(holding.todayPnLPercent)}`}>
                            {formatPercent(holding.todayPnLPercent)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                          <p className="label">总盈亏</p>
                          <p className={`mt-2 truncate text-base font-semibold ${pnlClass(holding.totalPnL)}`}>
                            {formatCurrency(holding.totalPnL, holding.currency)}
                          </p>
                          <p className={`mt-1 text-xs ${pnlClass(holding.totalPnLPercent)}`}>
                            {formatPercent(holding.totalPnLPercent)}
                          </p>
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div className="min-w-0">
                          <dt className="label">市值</dt>
                          <dd className="mt-1 truncate font-medium text-slate-950 dark:text-slate-50">
                            {formatCurrency(holding.marketValue, holding.currency)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="label">当前价</dt>
                          <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">
                            {formatCurrency(holding.currentPrice, holding.currency)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="label">数量</dt>
                          <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">
                            {holding.quantity.toLocaleString("zh-CN")}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="label">成本价</dt>
                          <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">
                            {formatCurrency(holding.averageCost, holding.currency)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="label">来源</dt>
                          <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">
                            {DATA_SOURCE_LABELS[holding.dataSource]}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="label">更新</dt>
                          <dd className="mt-1 truncate text-slate-700 dark:text-slate-200">
                            {formatDateTime(holding.lastUpdated)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  )
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
