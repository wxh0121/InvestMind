import type { BackupPayload } from "@/services/portfolioService";

interface CloudPortfolioResponse {
  ok: boolean;
  backup: BackupPayload | null;
  updatedAt: string | null;
  error?: string;
}

interface CloudSaveResponse {
  ok: boolean;
  updatedAt: string;
  error?: string;
}

const readJson = async <T extends { ok: boolean; error?: string }>(
  response: Response,
  fallbackMessage: string
) => {
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
};

export const getCloudPortfolio = async () => {
  const response = await fetch("/api/cloud/portfolio", {
    credentials: "include"
  });
  return readJson<CloudPortfolioResponse>(response, "无法读取云端持仓");
};

export const saveCloudPortfolio = async (backup: BackupPayload) => {
  const response = await fetch("/api/cloud/portfolio", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ backup })
  });
  return readJson<CloudSaveResponse>(response, "无法保存云端持仓");
};
