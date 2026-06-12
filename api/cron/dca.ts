import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runDueDcaPlans } from "../../lib/server/dca.js";
import { allowMethods, sendJson } from "../../lib/server/http.js";

const getBearerToken = (authorization?: string | string[]) => {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return header?.match(/^Bearer\s+(.+)$/i)?.[1];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET"])) return;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && getBearerToken(req.headers.authorization) !== cronSecret) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  try {
    const summary = await runDueDcaPlans();
    sendJson(res, summary.ok ? 200 : 207, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "定投 Cron 执行失败";
    sendJson(res, message.includes("POSTGRES_URL") ? 503 : 500, {
      ok: false,
      error: message
    });
  }
}
