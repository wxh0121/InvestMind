import {
  ASSET_TYPE_LABELS,
  MARKET_LABELS,
  type AssetType,
  type Currency,
  type Holding,
  type HoldingDraft,
  type Market
} from "@/types/holding";
import type { AllocationEntry, CurrencyRateMap, PortfolioSummary } from "@/types/portfolio";

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const roundPercent = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const calculateMarketValue = (quantity: number, currentPrice: number) =>
  roundMoney(quantity * currentPrice);

export const calculateCostValue = (quantity: number, averageCost: number) =>
  roundMoney(quantity * averageCost);

export const calculateTodayPnL = (quantity: number, currentPrice: number, previousClose: number) =>
  roundMoney(quantity * (currentPrice - previousClose));

export const calculateTodayPnLPercent = (currentPrice: number, previousClose: number) => {
  if (!previousClose) return 0;
  return roundPercent(((currentPrice - previousClose) / previousClose) * 100);
};

export const calculateTotalPnL = (quantity: number, currentPrice: number, averageCost: number) =>
  roundMoney(quantity * (currentPrice - averageCost));

export const calculateTotalPnLPercent = (currentPrice: number, averageCost: number) => {
  if (!averageCost) return 0;
  return roundPercent(((currentPrice - averageCost) / averageCost) * 100);
};

export const convertCurrency = (
  value: number,
  currency: Currency,
  rates: CurrencyRateMap = {}
) => roundMoney(value * (rates[currency] ?? 1));

export const recomputeHolding = (holding: Holding | HoldingDraft): Holding => {
  const id = "id" in holding && holding.id ? holding.id : crypto.randomUUID();
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
    .sort((a, b) => b.value - a.value);

export const calculatePortfolioSummary = (
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

export const getAllocationPercent = <T extends string>(
  allocation: Array<AllocationEntry<T>>,
  key: T
) => allocation.find((entry) => entry.key === key)?.percent ?? 0;
