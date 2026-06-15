export type PendingPositionAdjustmentType = "BUY" | "SELL";
export type PendingPositionAdjustmentInputMode = "AMOUNT" | "QUANTITY";
export type PendingPositionAdjustmentStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface PendingPositionAdjustment {
  id: string;
  holdingId: string;
  holdingName: string;
  symbol: string;
  type: PendingPositionAdjustmentType;
  inputMode: PendingPositionAdjustmentInputMode;
  amount?: number;
  quantity?: number;
  executeAt: string;
  status: PendingPositionAdjustmentStatus;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  lastMessage?: string;
}

export type PendingPositionAdjustmentDraft = Omit<
  PendingPositionAdjustment,
  "id" | "status" | "createdAt" | "updatedAt" | "executedAt" | "lastMessage"
> & {
  id?: string;
  status?: PendingPositionAdjustmentStatus;
  createdAt?: string;
  updatedAt?: string;
  executedAt?: string;
  lastMessage?: string;
};
