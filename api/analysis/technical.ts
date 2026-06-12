import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Holding } from "../../src/types/holding.js";
import { allowMethods, sendJson } from "../../lib/server/http.js";
import { analyzeHoldingTechnicals } from "../../lib/server/technical.js";

interface TechnicalRequestBody {
  holdings?: Holding[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const body = req.body as TechnicalRequestBody | undefined;
  const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
  if (!holdings.length) {
    sendJson(res, 400, { ok: false, analyses: [], error: "holdings is required" });
    return;
  }

  const analyses = await Promise.all(holdings.map((holding) => analyzeHoldingTechnicals(holding)));
  sendJson(res, 200, { ok: true, analyses });
}
