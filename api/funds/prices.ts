import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, parseSymbols, sendJson } from "../../lib/server/http.js";
import { getFundPrices } from "../../lib/server/funds.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const symbols = parseSymbols(req.query.symbols);
  if (!symbols.length) {
    sendJson(res, 400, { source: "EASTMONEY", prices: [], error: "symbols is required" });
    return;
  }

  try {
    const prices = await getFundPrices(symbols);
    sendJson(res, 200, { source: "EASTMONEY", prices });
  } catch (error) {
    sendJson(res, 500, {
      source: "EASTMONEY",
      prices: [],
      error: error instanceof Error ? error.message : "Failed to load fund prices"
    });
  }
}
