import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, sendJson } from "../../lib/server/http.js";
import { getOkxBalances } from "../../lib/server/okx.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  try {
    const assets = await getOkxBalances();
    sendJson(res, 200, { source: "OKX", assets });
  } catch (error) {
    sendJson(res, 500, {
      source: "OKX",
      assets: [],
      error: error instanceof Error ? error.message : "Failed to load OKX balances"
    });
  }
}
