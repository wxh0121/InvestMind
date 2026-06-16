import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSessionUser } from "../../lib/server/auth.js";
import { query } from "../../lib/server/db.js";
import {
  createDcaCronSummary,
  isBackupPayload,
  processDuePortfolioPayload,
  type BackupPayload
} from "../../lib/server/dca.js";
import { allowMethods, sendJson } from "../../lib/server/http.js";
import { mergeCloudPortfolioPayload } from "../../lib/server/portfolioMerge.js";

interface PortfolioRow {
  payload: unknown;
  updated_at: string;
}

const statusForError = (error: Error) => {
  if (error.message.includes("POSTGRES_URL")) return 503;
  if (error.message.includes("请先登录")) return 401;
  if (error.message.includes("格式")) return 400;
  return 500;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ["GET", "PUT"])) return;

  try {
    const user = await requireSessionUser(req);

    if (req.method === "GET") {
      const result = await query<PortfolioRow>(
        "select payload, updated_at from investmind_portfolios where user_id = $1",
        [user.id]
      );
      const row = result.rows[0];
      if (row?.payload && isBackupPayload(row.payload)) {
        const now = new Date();
        const processed = await processDuePortfolioPayload(row.payload, now, createDcaCronSummary(now));

        if (processed.changed) {
          const updated = await query<{ updated_at: string }>(
            `update investmind_portfolios
             set payload = $2::jsonb, updated_at = now()
             where user_id = $1
             returning updated_at`,
            [user.id, JSON.stringify(processed.payload)]
          );
          sendJson(res, 200, {
            ok: true,
            backup: processed.payload,
            updatedAt: updated.rows[0]?.updated_at ?? new Date().toISOString()
          });
          return;
        }
      }

      sendJson(res, 200, {
        ok: true,
        backup: row?.payload ?? null,
        updatedAt: row?.updated_at ?? null
      });
      return;
    }

    const backup = req.body?.backup as BackupPayload | undefined;
    if (!isBackupPayload(backup)) {
      throw new Error("云端备份格式不正确");
    }

    const existing = await query<PortfolioRow>(
      "select payload, updated_at from investmind_portfolios where user_id = $1",
      [user.id]
    );
    const row = existing.rows[0];
    let payloadToSave: BackupPayload = backup;

    if (row?.payload && isBackupPayload(row.payload)) {
      const now = new Date();
      const processed = await processDuePortfolioPayload(row.payload, now, createDcaCronSummary(now));
      payloadToSave = mergeCloudPortfolioPayload(backup, processed.payload, now);
    } else {
      const now = new Date();
      const processed = await processDuePortfolioPayload(backup, now, createDcaCronSummary(now));
      payloadToSave = processed.payload;
    }

    const result = await query<{ updated_at: string }>(
      `insert into investmind_portfolios (user_id, payload, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (user_id)
       do update set payload = excluded.payload, updated_at = now()
       returning updated_at`,
      [user.id, JSON.stringify(payloadToSave)]
    );

    sendJson(res, 200, {
      ok: true,
      backup: payloadToSave,
      updatedAt: result.rows[0]?.updated_at ?? new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "云端同步失败";
    sendJson(res, error instanceof Error ? statusForError(error) : 500, { ok: false, error: message });
  }
}
