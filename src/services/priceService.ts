import type { Holding } from "@/types/holding";
import type { PriceUpdate, RefreshResponse } from "@/types/portfolio";
import { addSnapshot, replaceHoldings } from "@/services/portfolioService";
import { recomputeHolding } from "@/utils/calculations";

const mergeUpdates = (holdings: Holding[], response: RefreshResponse) => {
  const updates = new Map(response.updates.map((update) => [update.symbol.toUpperCase(), update]));

  return holdings.map((holding) => {
    const update = updates.get(holding.symbol.toUpperCase());
    if (!update) return recomputeHolding(holding);

    return recomputeHolding({
      ...holding,
      currentPrice: update.currentPrice ?? holding.currentPrice,
      previousClose: update.previousClose ?? holding.previousClose,
      quantity: update.quantity ?? holding.quantity,
      dataSource: update.source
    });
  });
};

const requestRefreshPrices = async (refreshableHoldings: Holding[]) => {
  const response = await fetch("/api/refresh-prices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ holdings: refreshableHoldings })
  });

  if (!response.ok) {
    throw new Error(`刷新失败：${response.status}`);
  }

  return (await response.json()) as RefreshResponse;
};

export const refreshHoldingPrice = async (holding: Holding): Promise<PriceUpdate> => {
  if (holding.dataSource === "MANUAL") {
    throw new Error("手动录入资产无法自动查询价格");
  }

  const result = await requestRefreshPrices([holding]);
  const update = result.updates.find(
    (item) => item.symbol.toUpperCase() === holding.symbol.toUpperCase()
  );

  if (!update) {
    const error = result.errors[0]?.message;
    throw new Error(error || "未查询到该资产的最新价格");
  }

  return update;
};

export const refreshPrices = async (holdings: Holding[], refreshableHoldings = holdings) => {
  const result = await requestRefreshPrices(refreshableHoldings);
  const mergedHoldings = mergeUpdates(holdings, result);
  await replaceHoldings(mergedHoldings);
  await addSnapshot(mergedHoldings);

  return {
    result,
    holdings: mergedHoldings
  };
};
