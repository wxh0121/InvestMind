import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureSchema, query } from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
}

interface UserRecord extends AuthUser {
  password_hash: string;
  password_salt: string;
}

const SESSION_COOKIE = "im_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

export const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const validatePassword = (password: string) => password.length >= 8;

const hashPassword = (password: string, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex")
});

const verifyPassword = (password: string, salt: string, expectedHash: string) => {
  const actualHash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && crypto.timingSafeEqual(actualHash, expected);
};

const parseCookies = (cookieHeader?: string) =>
  Object.fromEntries(
    String(cookieHeader ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        const key = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);
        const value = separatorIndex === -1 ? "" : entry.slice(separatorIndex + 1);
        return [decodeURIComponent(key), decodeURIComponent(value)];
      })
  );

const sessionCookie = (sessionId: string, maxAge = SESSION_MAX_AGE_SECONDS) => {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${maxAge}`;
};

export const setSessionCookie = (res: VercelResponse, sessionId: string) => {
  res.setHeader("Set-Cookie", sessionCookie(sessionId));
};

export const clearSessionCookie = (res: VercelResponse) => {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
};

export const createUser = async (emailInput: unknown, passwordInput: unknown) => {
  await ensureSchema();

  const email = normalizeEmail(emailInput);
  const password = String(passwordInput ?? "");
  if (!validateEmail(email)) throw new Error("请输入有效邮箱");
  if (!validatePassword(password)) throw new Error("密码至少需要 8 位");

  const { salt, hash } = hashPassword(password);
  const id = crypto.randomUUID();

  try {
    const result = await query<AuthUser>(
      "insert into investmind_users (id, email, password_hash, password_salt) values ($1, $2, $3, $4) returning id, email",
      [id, email, hash, salt]
    );
    return result.rows[0];
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      throw new Error("该邮箱已注册");
    }
    throw error;
  }
};

export const authenticateUser = async (emailInput: unknown, passwordInput: unknown) => {
  await ensureSchema();

  const email = normalizeEmail(emailInput);
  const password = String(passwordInput ?? "");
  const result = await query<UserRecord>(
    "select id, email, password_hash, password_salt from investmind_users where email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw new Error("邮箱或密码不正确");
  }

  return { id: user.id, email: user.email };
};

export const createSession = async (userId: string) => {
  await ensureSchema();

  const sessionId = crypto.randomBytes(32).toString("hex");
  await query(
    "insert into investmind_sessions (id, user_id, expires_at) values ($1, $2, now() + interval '30 days')",
    [sessionId, userId]
  );
  return sessionId;
};

export const getSessionUser = async (req: VercelRequest): Promise<AuthUser | null> => {
  const sessionId = parseCookies(req.headers.cookie).im_session;
  if (!sessionId) return null;

  await ensureSchema();

  const result = await query<AuthUser>(
    `select users.id, users.email
     from investmind_sessions sessions
     join investmind_users users on users.id = sessions.user_id
     where sessions.id = $1 and sessions.expires_at > now()`,
    [sessionId]
  );

  return result.rows[0] ?? null;
};

export const requireSessionUser = async (req: VercelRequest) => {
  const user = await getSessionUser(req);
  if (!user) throw new Error("请先登录");
  return user;
};

export const deleteCurrentSession = async (req: VercelRequest) => {
  const sessionId = parseCookies(req.headers.cookie).im_session;
  if (!sessionId) return;

  await ensureSchema();

  if (sessionId) {
    await query("delete from investmind_sessions where id = $1", [sessionId]);
  }
};
