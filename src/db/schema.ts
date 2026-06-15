import type { Holding } from "@/types/holding";
import type { PortfolioSnapshot } from "@/types/portfolio";
import type { SettingRecord } from "@/types/settings";
import type { Transaction } from "@/types/transaction";
import type { DcaPlan } from "@/types/dcaPlan";
import type { PendingPositionAdjustment } from "@/types/positionAdjustment";

export interface InvestmentDiarySchema {
  holdings: Holding;
  snapshots: PortfolioSnapshot;
  settings: SettingRecord;
  transactions: Transaction;
  dcaPlans: DcaPlan;
  pendingPositionAdjustments: PendingPositionAdjustment;
}
