import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  authenticateUser,
  clearSessionCookie,
  createSession,
  createUser,
  deleteCurrentSession,
  getSessionUser,
  setSessionCookie
} from "../../lib/server/auth.js";
import { allowMethods, sendJson } from "../../lib/server/http.js";

type AuthAction = "login" | "register" | "logout" | "me";

const getAction = (req: VercelRequest): AuthAction | undefined => {
  const value = req.query.action;
  const actionFromQuery = Array.isArray(value) ? value[0] : value;
  const action = actionFromQuery ?? req.url?.split("?")[0]?.split("/").filter(Boolean).at(-1);
  return action === "login" || action === "register" || action === "logout" || action === "me"
    ? action
    : undefined;
};

const statusForError = (error: Error, action: AuthAction) => {
  if (error.message.includes("POSTGRES_URL")) return 503;
  if (error.message.includes("请先登录")) return 401;
  if (error.message.includes("邮箱") || error.message.includes("密码")) {
    return action === "register" ? 400 : 401;
  }
  return 500;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getAction(req);
  if (!action) {
    sendJson(res, 404, { ok: false, error: "Auth action not found" });
    return;
  }

  if (action === "me") {
    if (!allowMethods(req, res, ["GET"])) return;
    try {
      const user = await getSessionUser(req);
      sendJson(res, 200, { ok: true, user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取登录状态";
      if (message.includes("POSTGRES_URL")) {
        sendJson(res, 200, { ok: true, user: null, cloudUnavailable: true, error: message });
        return;
      }
      sendJson(res, 500, { ok: false, error: message });
    }
    return;
  }

  if (action === "logout") {
    if (!allowMethods(req, res, ["POST"])) return;
    try {
      await deleteCurrentSession(req);
    } finally {
      clearSessionCookie(res);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const user =
      action === "login"
        ? await authenticateUser(req.body?.email, req.body?.password)
        : await createUser(req.body?.email, req.body?.password);
    const sessionId = await createSession(user.id);
    setSessionCookie(res, sessionId);
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : action === "login" ? "登录失败" : "注册失败";
    sendJson(res, error instanceof Error ? statusForError(error, action) : 500, { ok: false, error: message });
  }
}
