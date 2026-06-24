export type DcaFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type DcaInputMode = "AMOUNT" | "QUANTITY";
export type DcaRunStatus = "SUCCESS" | "FAILED";

export interface DcaPlan {
  id: string;
  holdingId: string;
  holdingName: string;
  symbol: string;
  inputMode: DcaInputMode;
  amount?: number;
  quantity?: number;
  frequency: DcaFrequency;
  hour?: number;
  weekday?: number;
  month?: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: DcaRunStatus;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeletedDcaPlan {
  id: string;
  deletedAt: string;
}

export type DcaPlanDraft = Omit<
  DcaPlan,
  "id" | "enabled" | "nextRunAt" | "lastRunAt" | "lastStatus" | "lastMessage" | "createdAt" | "updatedAt"
> & {
  id?: string;
  enabled?: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: DcaRunStatus;
  lastMessage?: string;
};

export const DCA_FREQUENCY_LABELS: Record<DcaFrequency, string> = {
  DAILY: "交易日",
  WEEKLY: "每周",
  MONTHLY: "每月"
};

export const DCA_INPUT_MODE_LABELS: Record<DcaInputMode, string> = {
  AMOUNT: "按金额",
  QUANTITY: "按数量"
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五"
};
