import { db } from "@/db";
import type { DcaPlan, DcaPlanDraft, DeletedDcaPlan } from "@/types/dcaPlan";
import type { PendingPositionAdjustment, PendingPositionAdjustmentDraft } from "@/types/positionAdjustment";
import type { AssetType, DataSource, Holding, HoldingDraft, Market } from "@/types/holding";
import type { PortfolioSnapshot } from "@/types/portfolio";
import {
  DEFAULT_TARGET_ALLOCATION,
  DEFAULT_SETTINGS,
  type PortfolioSettings,
  type SettingRecord
} from "@/types/settings";
import { calculatePortfolioSummary, recomputeHolding } from "@/utils/calculations";
import { DCA_EXECUTION_HOUR, DCA_EXECUTION_MINUTE, computeNextDcaRunAt } from "@/utils/dcaSchedule";

const SETTINGS_KEY = "portfolio";

type LegacyDataSource = DataSource;
type LegacyAssetType = AssetType | "ETF" | "FUND" | "CASH" | "THEMATIC_FUND";
type LegacyDataSourceSettings = Partial<PortfolioSettings["dataSources"]> & {
};

type LegacyPortfolioSettings = Omit<Partial<PortfolioSettings>, "dataSources"> & {
  dataSources?: LegacyDataSourceSettings;
};

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  holdings: Holding[];
  snapshots: PortfolioSnapshot[];
  dcaPlans?: DcaPlan[];
  deletedDcaPlans?: DeletedDcaPlan[];
  pendingPositionAdjustments?: PendingPositionAdjustment[];
  settings: PortfolioSettings;
}

const normalizeDataSource = (dataSource: unknown): DataSource => {
  if (
    dataSource === "OKX" ||
    dataSource === "YAHOO" ||
    dataSource === "EASTMONEY" ||
    dataSource === "MANUAL"
  ) {
    return dataSource;
  }
  return "MANUAL";
};

const normalizeAssetType = (assetType: unknown, market: Market): AssetType => {
  if (market === "CASH") return "CASH";
  if (market === "CRYPTO") return "CRYPTO";
  if (assetType === "INDEX_FUND" || assetType === "ETF") return "INDEX_FUND";
  if (assetType === "SECTOR_FUND" || assetType === "FUND" || assetType === "THEMATIC_FUND") {
    return "SECTOR_FUND";
  }
  return "STOCK";
};

const normalizeHolding = <T extends HoldingDraft | Holding>(holding: T) =>
  recomputeHolding({
    ...holding,
    ...(holding.market === "CASH"
      ? {
          name: holding.name || `${holding.currency} 现金`,
          symbol: `CASH-${holding.currency}`,
          quantity: holding.quantity,
          averageCost: 1,
          currentPrice: 1,
          previousClose: 1,
          dataSource: "MANUAL" as const
        }
      : {}),
    assetType: normalizeAssetType(
      (holding as T & { assetType?: LegacyAssetType }).assetType,
      holding.market
    ),
    dataSource:
      holding.market === "CASH"
        ? "MANUAL"
        : normalizeDataSource((holding as T & { dataSource?: LegacyDataSource }).dataSource)
  });

const isDcaPlanAtExecutionTime = (plan: DcaPlan) => {
  const nextRunAt = new Date(plan.nextRunAt);
  return (
    Number.isFinite(nextRunAt.getTime()) &&
    nextRunAt.getHours() === DCA_EXECUTION_HOUR &&
    nextRunAt.getMinutes() === DCA_EXECUTION_MINUTE
  );
};

const normalizeDcaPlanSchedule = (plan: DcaPlan) => {
  if (plan.hour === DCA_EXECUTION_HOUR && isDcaPlanAtExecutionTime(plan)) return plan;

  return {
    ...plan,
    hour: DCA_EXECUTION_HOUR,
    nextRunAt: computeNextDcaRunAt(plan),
    updatedAt: new Date().toISOString()
  };
};

const normalizeSettings = (settings?: LegacyPortfolioSettings): PortfolioSettings => ({
  ...DEFAULT_SETTINGS,
  ...settings,
  targetAllocationByMarket: {
    ...DEFAULT_TARGET_ALLOCATION,
    ...settings?.targetAllocationByMarket
  },
  dataSources: {
    okxEnabled: settings?.dataSources?.okxEnabled ?? DEFAULT_SETTINGS.dataSources.okxEnabled,
    yahooEnabled:
      settings?.dataSources?.yahooEnabled ??
      DEFAULT_SETTINGS.dataSources.yahooEnabled,
    eastmoneyEnabled:
      settings?.dataSources?.eastmoneyEnabled ?? DEFAULT_SETTINGS.dataSources.eastmoneyEnabled
  }
});

export const initializeDefaults = async () => {
  const settings = await db.settings.get(SETTINGS_KEY);
  if (!settings) {
    await db.settings.put({
      key: SETTINGS_KEY,
      value: DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString()
    } satisfies SettingRecord<PortfolioSettings>);
  }
};

export const getHoldings = async () => {
  await initializeDefaults();
  const holdings = await db.holdings.orderBy("lastUpdated").reverse().toArray();
  return holdings.map(normalizeHolding);
};

export const saveHolding = async (draft: HoldingDraft | Holding) => {
  const holding = normalizeHolding(draft);
  await db.holdings.put(holding);
  return holding;
};

export const deleteHolding = async (id: string) => {
  await db.holdings.delete(id);
};

export const getDcaPlans = async () => {
  const plans = await db.dcaPlans.orderBy("nextRunAt").toArray();
  const normalized = plans.map(normalizeDcaPlanSchedule);
  if (normalized.some((plan, index) => plan !== plans[index])) {
    await db.dcaPlans.bulkPut(normalized);
  }
  return normalized.slice().sort((first, second) => first.nextRunAt.localeCompare(second.nextRunAt));
};

export const saveDcaPlan = async (draft: DcaPlanDraft | DcaPlan) => {
  const now = new Date().toISOString();
  const normalizedDraft = {
    ...draft,
    hour: DCA_EXECUTION_HOUR
  };
  const plan: DcaPlan = {
    ...normalizedDraft,
    id: normalizedDraft.id || crypto.randomUUID(),
    enabled: normalizedDraft.enabled ?? true,
    nextRunAt: normalizedDraft.nextRunAt || computeNextDcaRunAt(normalizedDraft),
    createdAt: "createdAt" in normalizedDraft && normalizedDraft.createdAt ? normalizedDraft.createdAt : now,
    updatedAt: now
  };
  await db.transaction("rw", [db.dcaPlans, db.deletedDcaPlans], async () => {
    await db.dcaPlans.put(plan);
    await db.deletedDcaPlans.delete(plan.id);
  });
  return plan;
};

export const deleteDcaPlan = async (id: string) => {
  await db.transaction("rw", [db.dcaPlans, db.deletedDcaPlans], async () => {
    await db.dcaPlans.delete(id);
    await db.deletedDcaPlans.put({
      id,
      deletedAt: new Date().toISOString()
    });
  });
};

export const savePendingPositionAdjustment = async (
  draft: PendingPositionAdjustmentDraft | PendingPositionAdjustment
) => {
  const now = new Date().toISOString();
  const adjustment: PendingPositionAdjustment = {
    ...draft,
    id: draft.id || crypto.randomUUID(),
    status: draft.status ?? "PENDING",
    createdAt: draft.createdAt ?? now,
    updatedAt: now
  };
  await db.pendingPositionAdjustments.put(adjustment);
  return adjustment;
};

export const deletePendingPositionAdjustment = async (id: string) => {
  await db.pendingPositionAdjustments.delete(id);
};

export const replaceHoldings = async (holdings: Holding[]) => {
  await db.transaction("rw", db.holdings, async () => {
    await db.holdings.clear();
    await db.holdings.bulkPut(holdings.map(normalizeHolding));
  });
};

export const clearLocalPortfolio = async () => {
  await db.transaction(
    "rw",
    [
      db.holdings,
      db.snapshots,
      db.settings,
      db.transactions,
      db.dcaPlans,
      db.deletedDcaPlans,
      db.pendingPositionAdjustments
    ],
    async () => {
      await db.holdings.clear();
      await db.snapshots.clear();
      await db.transactions.clear();
      await db.dcaPlans.clear();
      await db.deletedDcaPlans.clear();
      await db.pendingPositionAdjustments.clear();
      await db.settings.clear();
      await db.settings.put({
        key: SETTINGS_KEY,
        value: DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString()
      } satisfies SettingRecord<PortfolioSettings>);
    }
  );
};

export const getSettings = async (): Promise<PortfolioSettings> => {
  await initializeDefaults();
  const record = await db.settings.get(SETTINGS_KEY);
  return normalizeSettings(record?.value as LegacyPortfolioSettings | undefined);
};

export const saveSettings = async (settings: PortfolioSettings) => {
  const normalizedSettings = normalizeSettings(settings);
  await db.settings.put({
    key: SETTINGS_KEY,
    value: normalizedSettings,
    updatedAt: new Date().toISOString()
  } satisfies SettingRecord<PortfolioSettings>);
  return normalizedSettings;
};

export const addSnapshot = async (holdings: Holding[]) => {
  const summary = calculatePortfolioSummary(holdings);
  const snapshot: PortfolioSnapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    totalMarketValue: summary.totalMarketValue,
    totalCostValue: summary.totalCostValue,
    todayPnL: summary.todayPnL,
    totalPnL: summary.totalPnL,
    holdings,
    allocationByMarket: summary.allocationByMarket,
    allocationByAssetType: summary.allocationByAssetType
  };
  await db.snapshots.put(snapshot);
  return snapshot;
};

export const exportBackup = async (): Promise<BackupPayload> => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  holdings: await db.holdings.toArray(),
  snapshots: await db.snapshots.orderBy("createdAt").reverse().toArray(),
  dcaPlans: await db.dcaPlans.orderBy("nextRunAt").toArray(),
  deletedDcaPlans: await db.deletedDcaPlans.orderBy("deletedAt").reverse().limit(1000).toArray(),
  pendingPositionAdjustments: await db.pendingPositionAdjustments.orderBy("executeAt").toArray(),
  settings: await getSettings()
});

export const importBackup = async (payload: BackupPayload) => {
  if (!payload || !Array.isArray(payload.holdings) || !payload.settings) {
    throw new Error("备份文件格式不正确");
  }

  await db.transaction(
    "rw",
    [db.holdings, db.snapshots, db.settings, db.dcaPlans, db.deletedDcaPlans, db.pendingPositionAdjustments],
    async () => {
      await db.holdings.clear();
      await db.holdings.bulkPut(payload.holdings.map(normalizeHolding));
      if (Array.isArray(payload.snapshots)) {
        await db.snapshots.clear();
        await db.snapshots.bulkPut(payload.snapshots);
      }
      await db.dcaPlans.clear();
      if (Array.isArray(payload.dcaPlans)) {
        await db.dcaPlans.bulkPut(payload.dcaPlans);
      }
      await db.deletedDcaPlans.clear();
      if (Array.isArray(payload.deletedDcaPlans)) {
        await db.deletedDcaPlans.bulkPut(payload.deletedDcaPlans);
      }
      await db.pendingPositionAdjustments.clear();
      if (Array.isArray(payload.pendingPositionAdjustments)) {
        await db.pendingPositionAdjustments.bulkPut(payload.pendingPositionAdjustments);
      }
      await saveSettings(normalizeSettings(payload.settings as LegacyPortfolioSettings));
    }
  );
};
