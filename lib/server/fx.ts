const getBaseUrl = () => process.env.FX_BASE_URL || "https://open.er-api.com";

interface ExchangeRateResponse {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
  "error-type"?: string;
}

export interface FxRateResult {
  baseCurrency: string;
  rates: Record<string, number>;
  updatedAt?: string;
}

export const getFxRates = async (baseCurrency: string, symbols: string[]): Promise<FxRateResult> => {
  const normalizedBase = baseCurrency.toUpperCase();
  const normalizedSymbols = Array.from(new Set([...symbols, normalizedBase].map((symbol) => symbol.toUpperCase())));
  const response = await fetch(`${getBaseUrl()}/v6/latest/USD`, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`FX request failed with ${response.status}`);
  }

  const payload = (await response.json()) as ExchangeRateResponse;
  if (payload.result !== "success" || !payload.rates) {
    throw new Error(payload["error-type"] || "FX response is invalid");
  }

  const baseRate = payload.rates[normalizedBase];
  if (!baseRate) {
    throw new Error(`FX rate not found for ${normalizedBase}`);
  }

  const rates = normalizedSymbols.reduce<Record<string, number>>((acc, symbol) => {
    if (symbol === "OTHER") {
      acc[symbol] = 1;
      return acc;
    }

    const sourceRate = payload.rates?.[symbol];
    if (sourceRate) {
      acc[symbol] = baseRate / sourceRate;
    }
    return acc;
  }, {});

  rates[normalizedBase] = 1;

  return {
    baseCurrency: normalizedBase,
    rates,
    updatedAt: payload.time_last_update_utc
  };
};
