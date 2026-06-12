import type { Currency } from "./holding";

export type TransactionType = "BUY" | "SELL" | "TRANSFER" | "DIVIDEND";

export interface Transaction {
  id: string;
  holdingId?: string;
  type: TransactionType;
  date: string;
  quantity?: number;
  price?: number;
  amount: number;
  currency: Currency;
  note?: string;
}
