import type { VercelRequest, VercelResponse } from "@vercel/node";

export const sendJson = (res: VercelResponse, status: number, body: unknown) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(body);
};

export const allowMethods = (
  req: VercelRequest,
  res: VercelResponse,
  methods: string[]
) => {
  if (methods.includes(req.method ?? "")) return true;
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { ok: false, error: "Method not allowed" });
  return false;
};

export const parseSymbols = (symbols?: string | string[]) =>
  String(Array.isArray(symbols) ? symbols.join(",") : symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
