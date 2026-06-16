import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, parseSymbols, sendJson } from "../../lib/server/http.js";
import { getEastMoneyIndexPrices } from "../../lib/server/indices.js";
import { getYahooPrices } from "../../lib/server/yahoo.js";

const firstQueryValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const symbols = parseSymbols(req.query.symbols);
  const market = firstQueryValue(req.query.market);
  const responseSource = market === "A_SHARE" ? "EASTMONEY" : "YAHOO";

  if (!symbols.length) {
    sendJson(res, 400, { source: responseSource, prices: [], error: "symbols is required" });
    return;
  }

  try {
    const prices =
      market === "A_SHARE"
        ? await getEastMoneyIndexPrices(symbols)
        : await getYahooPrices(symbols.map((symbol) => ({ symbol, market })));
    sendJson(res, 200, { source: responseSource, prices });
  } catch (error) {
    sendJson(res, 500, {
      source: responseSource,
      prices: [],
      error: error instanceof Error ? error.message : `Failed to load ${responseSource} prices`
    });
  }
}
