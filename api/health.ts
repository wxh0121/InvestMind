import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, sendJson } from "../lib/server/http.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  sendJson(res, 200, {
    ok: true,
    time: new Date().toISOString(),
    baseCurrency: process.env.APP_BASE_CURRENCY || "CNY"
  });
}
