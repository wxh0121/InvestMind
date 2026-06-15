import Dexie, { type Table } from "dexie";
import type { Holding } from "@/types/holding";
import type { PortfolioSnapshot } from "@/types/portfolio";
import type { SettingRecord } from "@/types/settings";
import type { Transaction } from "@/types/transaction";
import type { DcaPlan } from "@/types/dcaPlan";
import type { PendingPositionAdjustment } from "@/types/positionAdjustment";

class InvestmentDiaryDB extends Dexie {
  holdings!: Table<Holding, string>;
  snapshots!: Table<PortfolioSnapshot, string>;
  settings!: Table<SettingRecord, string>;
  transactions!: Table<Transaction, string>;
  dcaPlans!: Table<DcaPlan, string>;
  pendingPositionAdjustments!: Table<PendingPositionAdjustment, string>;

  constructor() {
    super("investment-diary");

    this.version(1).stores({
      holdings: "id, symbol, market, assetType, dataSource, lastUpdated",
      snapshots: "id, createdAt",
      settings: "key",
      transactions: "id, holdingId, type, date"
    });

    this.version(2).stores({
      holdings: "id, symbol, market, assetType, dataSource, lastUpdated",
      snapshots: "id, createdAt",
      settings: "key",
      transactions: "id, holdingId, type, date",
      dcaPlans: "id, holdingId, enabled, nextRunAt"
    });

    this.version(3).stores({
      holdings: "id, symbol, market, assetType, dataSource, lastUpdated",
      snapshots: "id, createdAt",
      settings: "key",
      transactions: "id, holdingId, type, date",
      dcaPlans: "id, holdingId, enabled, nextRunAt",
      pendingPositionAdjustments: "id, holdingId, status, executeAt"
    });
  }
}

export const db = new InvestmentDiaryDB();
