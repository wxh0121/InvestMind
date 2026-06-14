import { randomUUID } from "node:crypto";
import {
  ASSET_TYPE_LABELS,
  MARKET_LABELS,
  type AssetType,
  type DataSource,
  type Holding,
  type HoldingDraft,
  type Market
} from "../../src/types/holding.js";
import type { DcaPlan } from "../../src/types/dcaPlan.js";
import type { AllocationEntry, CurrencyRateMap, PortfolioSnapshot, PortfolioSummary } from "../../src/types/portfolio.js";
import type { PortfolioSettings } from "../../src/types/settings.js";
import { ensureSchema, query } from "./db.js";
import { getFundPrices } from "./funds.js";
import { getOkxPrices } from "./okx.js";
import type { NormalizedUpdate } from "./types.js";
import { getYahooPrices } from "./yahoo.js";

interface BackupPayload {
  version: 1;
  exportedAt: string;
  holdings: Holding[];
  snapshots?: PortfolioSnapshot[];
  dcaPlans?: DcaPlan[];
  settings: PortfolioSettings;
}

interface PortfolioRow {
  user_id: string;
  payload: unknown;
}

interface PlanExecutionResult {
  holdings: Holding[];
  plan: DcaPlan;
  success: boolean;
}

export interface DcaCronSummary {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  portfoliosScanned: number;
  portfoliosUpdated: number;
  plansDue: number;
  plansSucceeded: number;
  plansFailed: number;
  plansMigrated: number;
  errors: Array<{ userId?: string; message: string }>;
}

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const roundPercent = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const roundPositionNumber = (value: number) => Number(value.toFixed(8));
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const DCA_EXECUTION_HOUR = 15;
const DCA_EXECUTION_MINUTE = 30;

const isCashHolding = (holding: Holding) => holding.market === "CASH" || holding.assetType === "CASH";

const getChinaDateParts = (date: Date) => {
  const shifted = new Date(date.getTime() + CHINA_TIME_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    dayOfMonth: shifted.getUTCDate(),
    weekday: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
};

const fromChinaDateTime = (
  year: number,
  monthIndex: number,
  dayOfMonth: number,
  hour = DCA_EXECUTION_HOUR,
  minute = DCA_EXECUTION_MINUTE
) => new Date(Date.UTC(year, monthIndex, dayOfMonth, hour - 8, minute, 0, 0));

const isChinaWeekend = (date: Date) => {
  const weekday = getChinaDateParts(date).weekday;
  return weekday === 6 || weekday === 7;
};

const moveToNextChinaWeekday = (candidate: Date) => {
  while (isChinaWeekend(candidate)) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
};

const isChinaExecutionTime = (date: Date) => {
  const parts = getChinaDateParts(date);
  return parts.hour === DCA_EXECUTION_HOUR && parts.minute === DCA_EXECUTION_MINUTE;
};

const computeNextDcaRunAt = (
  schedule: Pick<DcaPlan, "frequency" | "weekday" | "month">,
  from = new Date()
) => {
  const parts = getChinaDateParts(from);
  const isFuture = (candidate: Date) => candidate.getTime() > from.getTime();

  if (schedule.frequency === "DAILY") {
    let candidate = fromChinaDateTime(parts.year, parts.monthIndex, parts.dayOfMonth);
    if (!isFuture(candidate)) {
      candidate = fromChinaDateTime(parts.year, parts.monthIndex, parts.dayOfMonth + 1);
    }
    return moveToNextChinaWeekday(candidate).toISOString();
  }

  if (schedule.frequency === "WEEKLY") {
    const weekday = schedule.weekday && schedule.weekday >= 1 && schedule.weekday <= 5 ? schedule.weekday : 1;
    const dayOffset = (weekday - parts.weekday + 7) % 7;
    let candidate = fromChinaDateTime(parts.year, parts.monthIndex, parts.dayOfMonth + dayOffset);
    if (!isFuture(candidate)) {
      candidate = fromChinaDateTime(parts.year, parts.monthIndex, parts.dayOfMonth + dayOffset + 7);
    }
    return candidate.toISOString();
  }

  const month = schedule.month && schedule.month >= 1 && schedule.month <= 12 ? schedule.month : 1;
  let candidate = fromChinaDateTime(parts.year, month - 1, 1);
  if (!isFuture(candidate)) {
    candidate = fromChinaDateTime(parts.year + 1, month - 1, 1);
  }
  return candidate.toISOString();
};

const calculateMarketValue = (quantity: number, currentPrice: number) =>
  roundMoney(quantity * currentPrice);

const calculateCostValue = (quantity: number, averageCost: number) =>
  roundMoney(quantity * averageCost);

const calculateTodayPnL = (quantity: number, currentPrice: number, previousClose: number) =>
  roundMoney(quantity * (currentPrice - previousClose));

const calculateTodayPnLPercent = (currentPrice: number, previousClose: number) => {
  if (!previousClose) return 0;
  return roundPercent(((currentPrice - previousClose) / previousClose) * 100);
};

const calculateTotalPnL = (quantity: number, currentPrice: number, averageCost: number) =>
  roundMoney(quantity * (currentPrice - averageCost));

const calculateTotalPnLPercent = (currentPrice: number, averageCost: number) => {
  if (!averageCost) return 0;
  return roundPercent(((currentPrice - averageCost) / averageCost) * 100);
};

const convertCurrency = (value: number, currency: Holding["currency"], rates: CurrencyRateMap = {}) =>
  roundMoney(value * (rates[currency] ?? 1));

const recomputeHolding = (holding: Holding | HoldingDraft): Holding => {
  const id = "id" in holding && holding.id ? holding.id : randomUUID();
  const previousClose = holding.previousClose || holding.currentPrice;
  const marketValue = calculateMarketValue(holding.quantity, holding.currentPrice);
  const costValue = calculateCostValue(holding.quantity, holding.averageCost);

  return {
    ...holding,
    id,
    previousClose,
    marketValue,
    costValue,
    todayPnL: calculateTodayPnL(holding.quantity, holding.currentPrice, previousClose),
    todayPnLPercent: calculateTodayPnLPercent(holding.currentPrice, previousClose),
    totalPnL: calculateTotalPnL(holding.quantity, holding.currentPrice, holding.averageCost),
    totalPnLPercent: calculateTotalPnLPercent(holding.currentPrice, holding.averageCost),
    lastUpdated: new Date().toISOString()
  };
};

const buildAllocation = <T extends string>(
  totals: Map<T, number>,
  grandTotal: number,
  labels: Record<T, string>
): Array<AllocationEntry<T>> =>
  Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      key,
      label: labels[key],
      value: roundMoney(value),
      percent: grandTotal ? roundPercent((value / grandTotal) * 100) : 0
    }))
    .sort((first, second) => second.value - first.value);

const calculatePortfolioSummary = (
  holdings: Holding[],
  rates: CurrencyRateMap = {}
): PortfolioSummary => {
  const computed = holdings.map(recomputeHolding);
  const totalMarketValue = roundMoney(
    computed.reduce((sum, item) => sum + convertCurrency(item.marketValue, item.currency, rates), 0)
  );
  const totalCostValue = roundMoney(
    computed.reduce((sum, item) => sum + convertCurrency(item.costValue, item.currency, rates), 0)
  );
  const todayPnL = roundMoney(
    computed.reduce((sum, item) => sum + convertCurrency(item.todayPnL, item.currency, rates), 0)
  );
  const totalPnL = roundMoney(
    computed.reduce((sum, item) => sum + convertCurrency(item.totalPnL, item.currency, rates), 0)
  );
  const marketTotals = new Map<Market, number>();
  const assetTypeTotals = new Map<AssetType, number>();

  for (const holding of computed) {
    const convertedMarketValue = convertCurrency(holding.marketValue, holding.currency, rates);
    marketTotals.set(holding.market, (marketTotals.get(holding.market) ?? 0) + convertedMarketValue);
    assetTypeTotals.set(
      holding.assetType,
      (assetTypeTotals.get(holding.assetType) ?? 0) + convertedMarketValue
    );
  }

  return {
    totalMarketValue,
    totalCostValue,
    todayPnL,
    todayPnLPercent: totalMarketValue - todayPnL ? roundPercent((todayPnL / (totalMarketValue - todayPnL)) * 100) : 0,
    totalPnL,
    totalPnLPercent: totalCostValue ? roundPercent((totalPnL / totalCostValue) * 100) : 0,
    allocationByMarket: buildAllocation(marketTotals, totalMarketValue, MARKET_LABELS),
    allocationByAssetType: buildAllocation(assetTypeTotals, totalMarketValue, ASSET_TYPE_LABELS)
  };
};

const createSnapshot = (holdings: Holding[], createdAt: string): PortfolioSnapshot => {
  const summary = calculatePortfolioSummary(holdings);
  return {
    id: randomUUID(),
    createdAt,
    totalMarketValue: summary.totalMarketValue,
    totalCostValue: summary.totalCostValue,
    todayPnL: summary.todayPnL,
    totalPnL: summary.totalPnL,
    holdings,
    allocationByMarket: summary.allocationByMarket,
    allocationByAssetType: summary.allocationByAssetType
  };
};

const isBackupPayload = (value: unknown): value is BackupPayload => {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<BackupPayload>;
  return payload.version === 1 && Array.isArray(payload.holdings) && Boolean(payload.settings);
};

const normalizeDcaPlan = (plan: DcaPlan, from: Date, updatedAt: string): DcaPlan => {
  const nextRunAt = new Date(plan.nextRunAt);
  const shouldNormalize =
    plan.hour !== DCA_EXECUTION_HOUR ||
    !Number.isFinite(nextRunAt.getTime()) ||
    !isChinaExecutionTime(nextRunAt) ||
    (plan.frequency === "DAILY" && isChinaWeekend(nextRunAt));
  if (!shouldNormalize) return plan;

  return {
    ...plan,
    hour: DCA_EXECUTION_HOUR,
    nextRunAt: computeNextDcaRunAt(plan, from),
    updatedAt
  };
};

const isPlanDue = (plan: DcaPlan, nowMs: number) => {
  if (!plan.enabled) return false;
  const nextRunMs = new Date(plan.nextRunAt).getTime();
  return Number.isFinite(nextRunMs) && nextRunMs <= nowMs;
};

const refreshHoldingPrice = async (holding: Holding): Promise<NormalizedUpdate> => {
  if (holding.dataSource === "OKX") {
    const price = (await getOkxPrices([holding.symbol]))[0];
    if (!price) throw new Error("OKX 未返回价格");
    return { ...price, source: "OKX" };
  }

  if (holding.dataSource === "YAHOO") {
    const price = (await getYahooPrices([{ symbol: holding.symbol, market: holding.market }]))[0];
    if (!price) throw new Error("Yahoo Finance 未返回价格");
    return price;
  }

  if (holding.dataSource === "EASTMONEY") {
    const price = (await getFundPrices([holding.symbol]))[0];
    if (!price) throw new Error("东财基金未返回价格");
    return price;
  }

  throw new Error("手动录入资产无法自动查询价格");
};

const withPlanResult = (
  plan: DcaPlan,
  now: Date,
  status: "SUCCESS" | "FAILED",
  message: string
): DcaPlan => ({
  ...plan,
  hour: DCA_EXECUTION_HOUR,
  nextRunAt: computeNextDcaRunAt(plan, now),
  lastRunAt: now.toISOString(),
  lastStatus: status,
  lastMessage: message,
  updatedAt: now.toISOString()
});

const executeDcaPlan = async (
  holdings: Holding[],
  plan: DcaPlan,
  now: Date
): Promise<PlanExecutionResult> => {
  try {
    const holding = holdings.find((item) => item.id === plan.holdingId);
    if (!holding) throw new Error("未找到该持仓");

    const update = await refreshHoldingPrice(holding);
    const price = update.currentPrice;
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("未查询到有效的最新价格");
    }

    const amountInput = Number(plan.amount);
    const quantityInput = Number(plan.quantity);
    const hasAmount = plan.inputMode === "AMOUNT" && Number.isFinite(amountInput) && amountInput > 0;
    const hasQuantity = plan.inputMode === "QUANTITY" && Number.isFinite(quantityInput) && quantityInput > 0;
    if (!hasAmount && !hasQuantity) {
      throw new Error("定投金额或数量必须大于 0");
    }

    const adjustmentQuantity = roundPositionNumber(hasAmount ? amountInput / price : quantityInput);
    const cashDelta = roundPositionNumber(hasAmount ? amountInput : adjustmentQuantity * price);
    if (!Number.isFinite(adjustmentQuantity) || adjustmentQuantity <= 0 || cashDelta <= 0) {
      throw new Error("计算出的定投数量或金额无效");
    }

    const refreshedHolding = recomputeHolding({
      ...holding,
      currentPrice: price,
      previousClose: update.previousClose ?? holding.previousClose,
      dataSource: update.source as DataSource
    });
    const cashHolding = holdings.find(
      (item) => isCashHolding(item) && item.currency === refreshedHolding.currency
    );
    const cashBalance = cashHolding?.marketValue ?? cashHolding?.quantity ?? 0;
    if (!cashHolding || cashBalance < cashDelta) {
      throw new Error(
        `扣款失败：现金不足，需要 ${cashDelta} ${refreshedHolding.currency}，当前 ${cashBalance} ${refreshedHolding.currency}`
      );
    }

    const nextQuantity = refreshedHolding.quantity + adjustmentQuantity;
    const nextAverageCost =
      (refreshedHolding.quantity * refreshedHolding.averageCost + adjustmentQuantity * price) / nextQuantity;
    const savedHolding = recomputeHolding({
      ...refreshedHolding,
      quantity: roundPositionNumber(nextQuantity),
      averageCost: roundPositionNumber(nextAverageCost),
      currentPrice: price,
      previousClose: update.previousClose ?? refreshedHolding.previousClose
    });
    const savedCash = recomputeHolding({
      ...cashHolding,
      quantity: roundPositionNumber(cashHolding.quantity - cashDelta),
      averageCost: 1,
      currentPrice: 1,
      previousClose: 1,
      dataSource: "MANUAL"
    });
    const nextHoldings = holdings.map((item) => {
      if (item.id === savedHolding.id) return savedHolding;
      if (item.id === savedCash.id) return savedCash;
      return item;
    });

    return {
      holdings: nextHoldings,
      plan: withPlanResult(plan, now, "SUCCESS", `扣款成功：${cashDelta} ${refreshedHolding.currency}`),
      success: true
    };
  } catch (error) {
    return {
      holdings,
      plan: withPlanResult(plan, now, "FAILED", error instanceof Error ? error.message : "扣款失败"),
      success: false
    };
  }
};

const processPortfolioPayload = async (
  payload: BackupPayload,
  now: Date,
  summary: DcaCronSummary
): Promise<{ payload: BackupPayload; changed: boolean; successfulRun: boolean }> => {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  let changed = false;
  let successfulRun = false;
  let holdings = payload.holdings.map(recomputeHolding);
  const plans = Array.isArray(payload.dcaPlans) ? payload.dcaPlans : [];
  const nextPlans: DcaPlan[] = [];
  const weekendCronRun = isChinaWeekend(now);

  for (const rawPlan of plans) {
    if (rawPlan.frequency === "DAILY" && weekendCronRun) {
      const normalizedPlan = normalizeDcaPlan(rawPlan, now, nowIso);

      if (normalizedPlan !== rawPlan) {
        changed = true;
        summary.plansMigrated += 1;
      }

      const nextRunAt = computeNextDcaRunAt(normalizedPlan, now);
      const weekendPlan =
        normalizedPlan.nextRunAt === nextRunAt
          ? normalizedPlan
          : {
              ...normalizedPlan,
              hour: DCA_EXECUTION_HOUR,
              nextRunAt,
              updatedAt: nowIso
            };
      if (weekendPlan !== normalizedPlan) {
        changed = true;
      }
      nextPlans.push(weekendPlan);
      continue;
    }

    const rawDue = isPlanDue(rawPlan, nowMs);
    const plan = rawDue
      ? { ...rawPlan, hour: DCA_EXECUTION_HOUR }
      : normalizeDcaPlan(rawPlan, now, nowIso);

    if (plan !== rawPlan) {
      changed = true;
      if (
        rawPlan.hour !== DCA_EXECUTION_HOUR ||
        (!rawDue && plan.nextRunAt !== rawPlan.nextRunAt)
      ) {
        summary.plansMigrated += 1;
      }
    }

    const due = rawDue || isPlanDue(plan, nowMs);

    if (!due) {
      nextPlans.push(plan);
      continue;
    }

    summary.plansDue += 1;
    const result = await executeDcaPlan(holdings, plan, now);
    holdings = result.holdings;
    nextPlans.push(result.plan);
    changed = true;

    if (result.success) {
      successfulRun = true;
      summary.plansSucceeded += 1;
    } else {
      summary.plansFailed += 1;
    }
  }

  if (!changed) {
    return { payload, changed: false, successfulRun: false };
  }

  return {
    changed: true,
    successfulRun,
    payload: {
      ...payload,
      exportedAt: nowIso,
      holdings,
      dcaPlans: nextPlans.sort((first, second) => first.nextRunAt.localeCompare(second.nextRunAt)),
      snapshots: successfulRun
        ? [createSnapshot(holdings, nowIso), ...(payload.snapshots ?? [])].slice(0, 500)
        : payload.snapshots
    }
  };
};

export const runDueDcaPlans = async (): Promise<DcaCronSummary> => {
  const startedAt = new Date();
  const summary: DcaCronSummary = {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    portfoliosScanned: 0,
    portfoliosUpdated: 0,
    plansDue: 0,
    plansSucceeded: 0,
    plansFailed: 0,
    plansMigrated: 0,
    errors: []
  };

  await ensureSchema();
  const result = await query<PortfolioRow>("select user_id, payload from investmind_portfolios");
  summary.portfoliosScanned = result.rows.length;

  for (const row of result.rows) {
    try {
      if (!isBackupPayload(row.payload)) {
        throw new Error("云端备份格式不正确");
      }

      const processed = await processPortfolioPayload(row.payload, startedAt, summary);
      if (!processed.changed) continue;

      await query(
        `update investmind_portfolios
         set payload = $2::jsonb, updated_at = now()
         where user_id = $1`,
        [row.user_id, JSON.stringify(processed.payload)]
      );
      summary.portfoliosUpdated += 1;
    } catch (error) {
      summary.errors.push({
        userId: row.user_id,
        message: error instanceof Error ? error.message : "定投执行失败"
      });
    }
  }

  summary.finishedAt = new Date().toISOString();
  summary.ok = summary.errors.length === 0;
  return summary;
};
