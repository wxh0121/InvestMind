import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, sendJson } from "../lib/server/http.js";
import { getFundPrices } from "../lib/server/funds.js";
import { getOkxPrices } from "../lib/server/okx.js";
import { getYahooPrices } from "../lib/server/yahoo.js";
import type { NormalizedUpdate, RefreshHoldingInput } from "../lib/server/types.js";

const unique = (values: string[]) => Array.from(new Set(values.map((value) => value.toUpperCase())));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const holdings = Array.isArray(req.body?.holdings) ? (req.body.holdings as RefreshHoldingInput[]) : [];
  const updates: NormalizedUpdate[] = [];
  const errors: Array<{ symbol?: string; source?: string; message: string }> = [];

  const okxSymbols = unique(
    holdings
      .filter((holding) => holding.dataSource === "OKX")
      .map((holding) => holding.symbol)
  );
  const yahooHoldings = holdings.filter((holding) => holding.dataSource === "YAHOO");
  const fundSymbols = unique(
    holdings
      .filter((holding) => holding.dataSource === "EASTMONEY")
      .map((holding) => holding.symbol)
  );

  if (okxSymbols.length) {
    try {
      const okxPrices = await getOkxPrices(okxSymbols);
      updates.push(...okxPrices.map((price) => ({ ...price, source: "OKX" as const })));
    } catch (error) {
      errors.push({
        source: "OKX",
        message: error instanceof Error ? error.message : "OKX refresh failed"
      });
    }
  }

  if (yahooHoldings.length) {
    try {
      updates.push(
        ...(await getYahooPrices(
          yahooHoldings.map((holding) => ({
            symbol: holding.symbol,
            market: holding.market
          }))
        ))
      );
    } catch (error) {
      errors.push({
        source: "YAHOO",
        message: error instanceof Error ? error.message : "Yahoo Finance refresh failed"
      });
    }
  }

  if (fundSymbols.length) {
    try {
      updates.push(...(await getFundPrices(fundSymbols)));
    } catch (error) {
      errors.push({
        source: "EASTMONEY",
        message: error instanceof Error ? error.message : "Fund refresh failed"
      });
    }
  }

  sendJson(res, 200, {
    ok: errors.length === 0,
    updatedAt: new Date().toISOString(),
    updates,
    errors
  });
}
