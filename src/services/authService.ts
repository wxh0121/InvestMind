import type { AuthUser } from "@/types/auth";

interface AuthResponse {
  ok: boolean;
  user: AuthUser | null;
  error?: string;
  cloudUnavailable?: boolean;
}

const readJson = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const data = (await response.json().catch(() => ({}))) as Partial<AuthResponse>;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || fallbackMessage);
  }
  return data as T;
};

const postAuth = async (url: string, email: string, password: string) => {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  return readJson<AuthResponse>(response, "账号请求失败");
};

export const getCurrentUser = async () => {
  const response = await fetch("/api/auth/me", {
    credentials: "include"
  });
  return readJson<AuthResponse>(response, "无法读取登录状态");
};

export const login = async (email: string, password: string) => postAuth("/api/auth/login", email, password);

export const register = async (email: string, password: string) =>
  postAuth("/api/auth/register", email, password);

export const logout = async () => {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include"
  });
  await readJson<{ ok: boolean }>(response, "退出登录失败");
};
