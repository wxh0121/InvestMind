import type { Holding } from "@/types/holding";
import type { HoldingAnalysis, RiskLevel } from "@/types/analysis";
import type { CurrencyRateMap, PortfolioSummary } from "@/types/portfolio";
import type { PortfolioSettings } from "@/types/settings";
import { convertCurrency, getAllocationPercent } from "@/utils/calculations";
import { formatPercent } from "@/utils/format";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const roundToStep = (value: number, step = 5) => Math.round(value / step) * step;

export const getRiskLevel = (holding: Holding): RiskLevel => {
  if (holding.market === "CRYPTO" || holding.assetType === "CRYPTO") return "HIGH";
  if (holding.market === "CASH") return "LOW";
  if (holding.assetType === "STOCK") return "HIGH";
  return "MEDIUM";
};

const getMaxSingleAssetPercent = (holding: Holding, settings: PortfolioSettings) => {
  if (holding.assetType === "CRYPTO") return Math.min(settings.maxSingleAssetPercent, 10);
  if (holding.assetType === "STOCK") return Math.min(settings.maxSingleAssetPercent, 10);
  if (holding.assetType === "INDEX_FUND" || holding.assetType === "SECTOR_FUND") {
    return Math.min(Math.max(settings.maxSingleAssetPercent, 15), 15);
  }
  return settings.maxSingleAssetPercent;
};

export const analyzeHolding = (
  holding: Holding,
  summary: PortfolioSummary,
  settings: PortfolioSettings,
  rates: CurrencyRateMap = {}
): HoldingAnalysis => {
  const riskLevel = getRiskLevel(holding);
  const targetAllocationPercent = settings.targetAllocationByMarket[holding.market] ?? 0;
  const currentAllocationPercent = getAllocationPercent(summary.allocationByMarket, holding.market);
  const convertedMarketValue = convertCurrency(holding.marketValue, holding.currency, rates);
  const singleAssetPercent = summary.totalMarketValue
    ? (convertedMarketValue / summary.totalMarketValue) * 100
    : 0;
  const maxSingleAssetPercent = getMaxSingleAssetPercent(holding, settings);
  const priceDeviationPercent = holding.averageCost
    ? ((holding.currentPrice - holding.averageCost) / holding.averageCost) * 100
    : 0;
  const marketUnderweight = targetAllocationPercent - currentAllocationPercent;
  const reasons: string[] = [];
  let score = 0;

  if (holding.market === "CASH") {
    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      action: "WATCH",
      addSuggestionPercent: 0,
      riskLevel: "LOW",
      reasons: ["现金仅作为配置参考，不输出加仓建议"],
      indicators: [
        { label: "当前配置", value: formatPercent(singleAssetPercent) },
        { label: "市场目标", value: formatPercent(targetAllocationPercent) }
      ],
      currentAllocationPercent,
      targetAllocationPercent,
      singleAssetPercent
    };
  }

  if (singleAssetPercent > maxSingleAssetPercent) {
    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      action: singleAssetPercent > maxSingleAssetPercent + 2 ? "REDUCE" : "HOLD",
      addSuggestionPercent: 0,
      riskLevel,
      reasons: ["当前单资产占比过高，不建议继续加仓"],
      indicators: [
        { label: "单资产占比", value: formatPercent(singleAssetPercent) },
        { label: "单资产上限", value: formatPercent(maxSingleAssetPercent) }
      ],
      currentAllocationPercent,
      targetAllocationPercent,
      singleAssetPercent
    };
  }

  if (marketUnderweight > 5 && holding.todayPnLPercent < 3) {
    score += 10;
    reasons.push("当前市场占比低于目标配置 5% 以上，且今日涨幅不高");
  }

  if (priceDeviationPercent <= -10 && currentAllocationPercent <= targetAllocationPercent + 2) {
    score += 10;
    reasons.push("当前价格低于平均成本 10% 以上，且未明显超配");
  }

  if (priceDeviationPercent <= -20) {
    score += 5;
    reasons.push("价格相对成本折价较深，可考虑分批观察");
  }

  if (holding.todayPnLPercent > 5) {
    score -= 10;
    reasons.push("今日涨幅较高，避免短期追高");
  }

  if (holding.todayPnLPercent < -5 && marketUnderweight > 0) {
    score += 5;
    reasons.push("单日下跌且长期配置不足，适合小比例分批评估");
  }

  if (currentAllocationPercent > targetAllocationPercent + 3) {
    score -= 5;
    reasons.push("当前市场占比已经高于目标配置");
  }

  if (riskLevel === "HIGH") {
    score -= 5;
    reasons.push("资产风险等级较高，单次加仓应更克制");
  }

  const cap = holding.assetType === "CRYPTO" || holding.market === "CRYPTO" ? 5 : 20;
  const addSuggestionPercent = clamp(roundToStep(score), 0, cap);
  const action =
    addSuggestionPercent >= 10
      ? "BUY_MORE"
      : addSuggestionPercent > 0
        ? "WATCH"
        : currentAllocationPercent > targetAllocationPercent + 8
          ? "REDUCE"
          : "HOLD";

  if (!reasons.length) {
    reasons.push("当前配置接近规则区间，建议继续观察");
  }

  return {
    holdingId: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    action,
    addSuggestionPercent,
    riskLevel,
    reasons,
    indicators: [
      { label: "市场配置", value: `${formatPercent(currentAllocationPercent)} / ${formatPercent(targetAllocationPercent)}` },
      { label: "单资产占比", value: `${formatPercent(singleAssetPercent)} / ${formatPercent(maxSingleAssetPercent)}` },
      { label: "价格偏离成本", value: formatPercent(priceDeviationPercent) },
      { label: "今日涨跌", value: formatPercent(holding.todayPnLPercent) }
    ],
    currentAllocationPercent,
    targetAllocationPercent,
    singleAssetPercent
  };
};

export const analyzePortfolio = (
  holdings: Holding[],
  summary: PortfolioSummary,
  settings: PortfolioSettings,
  rates: CurrencyRateMap = {}
) => holdings.map((holding) => analyzeHolding(holding, summary, settings, rates));
