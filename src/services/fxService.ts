import type { Currency } from "@/types/holding";
import type { FxRates } from "@/types/portfolio";

export const getFxRates = async (baseCurrency: Currency, currencies: Currency[]): Promise<FxRates> => {
  const symbols = Array.from(new Set([...currencies, baseCurrency]));
  const response = await fetch(
    `/api/fx/rates?base=${encodeURIComponent(baseCurrency)}&symbols=${encodeURIComponent(symbols.join(","))}`
  );

  if (!response.ok) {
    throw new Error(`汇率刷新失败：${response.status}`);
  }

  return (await response.json()) as FxRates;
};
