import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, parseSymbols, sendJson } from "../../lib/server/http.js";
import { getYahooPrices } from "../../lib/server/yahoo.js";

const firstQueryValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const symbols = parseSymbols(req.query.symbols);
  if (!symbols.length) {
    sendJson(res, 400, { source: "YAHOO", prices: [], error: "symbols is required" });
    return;
  }

  try {
    const market = firstQueryValue(req.query.market);
    const prices = await getYahooPrices(symbols.map((symbol) => ({ symbol, market })));
    sendJson(res, 200, { source: "YAHOO", prices });
  } catch (error) {
    sendJson(res, 500, {
      source: "YAHOO",
      prices: [],
      error: error instanceof Error ? error.message : "Failed to load Yahoo Finance prices"
    });
  }
}
