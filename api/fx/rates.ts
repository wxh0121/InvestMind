import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, parseSymbols, sendJson } from "../../lib/server/http.js";
import { getFxRates } from "../../lib/server/fx.js";

const firstQueryValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const baseCurrency = firstQueryValue(req.query.base)?.toUpperCase() || "CNY";
  const symbols = parseSymbols(req.query.symbols);

  try {
    sendJson(res, 200, await getFxRates(baseCurrency, symbols));
  } catch (error) {
    sendJson(res, 500, {
      baseCurrency,
      rates: { [baseCurrency]: 1 },
      error: error instanceof Error ? error.message : "Failed to load FX rates"
    });
  }
}
