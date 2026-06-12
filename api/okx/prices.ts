import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, parseSymbols, sendJson } from "../../lib/server/http.js";
import { getOkxPrices } from "../../lib/server/okx.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const symbols = parseSymbols(req.query.symbols);
  if (!symbols.length) {
    sendJson(res, 400, { source: "OKX", prices: [], error: "symbols is required" });
    return;
  }

  try {
    const prices = await getOkxPrices(symbols);
    sendJson(res, 200, { source: "OKX", prices });
  } catch (error) {
    sendJson(res, 500, {
      source: "OKX",
      prices: [],
      error: error instanceof Error ? error.message : "Failed to load OKX prices"
    });
  }
}
