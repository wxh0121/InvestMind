import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Holding, HoldingDraft } from "@/types/holding";
import type { HoldingAnalysis } from "@/types/analysis";
import type { CurrencyRateMap, PortfolioSummary } from "@/types/portfolio";
import type { BackupPayload } from "@/services/portfolioService";
import {
  addSnapshot,
  clearLocalPortfolio,
  deleteHolding,
  deleteDcaPlan,
  deletePendingPositionAdjustment,
  exportBackup,
  getDcaPlans,
  getHoldings,
  getSettings,
  importBackup,
  saveDcaPlan,
  saveHolding,
  savePendingPositionAdjustment,
  saveSettings
} from "@/services/portfolioService";
import { analyzePortfolio } from "@/services/analysisService";
import { getCloudPortfolio, saveCloudPortfolio } from "@/services/cloudPortfolioService";
import { getFxRates } from "@/services/fxService";
import { refreshHoldingPrice, refreshPrices } from "@/services/priceService";
import { useAuth } from "@/context/AuthContext";
import type { DcaPlan, DcaPlanDraft } from "@/types/dcaPlan";
import type { PortfolioSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { calculatePortfolioSummary, recomputeHolding } from "@/utils/calculations";

type RefreshStatus = "idle" | "loading" | "success" | "partial" | "error";
type CloudSyncStatus = "local" | "syncing" | "synced" | "error";
type PositionAdjustmentType = "BUY" | "SELL";
const LOCAL_OWNER_KEY = "investmind.portfolioOwner";

interface PositionAdjustmentInput {
  holdingId: string;
  type: PositionAdjustmentType;
  quantity?: number;
  amount?: number;
  price?: number;
}

interface PositionAdjustmentResult {
  holding: Holding;
  price: number;
  quantity: number;
  amount: number;
}

interface QueuedPositionAdjustmentInput {
  holdingId: string;
  type: PositionAdjustmentType;
  quantity?: number;
  amount?: number;
  executeAt: string;
}

const roundPositionNumber = (value: number) => Number(value.toFixed(8));

const isCashHolding = (holding: Holding) => holding.market === "CASH" || holding.assetType === "CASH";

const createCashHoldingDraft = (holding: Holding, amount: number): HoldingDraft => ({
  name: `${holding.currency} 现金`,
  symbol: `CASH-${holding.currency}`,
  market: "CASH",
  assetType: "CASH",
  currency: holding.currency,
  quantity: roundPositionNumber(amount),
  averageCost: 1,
  currentPrice: 1,
  previousClose: 1,
  dataSource: "MANUAL",
  note: ""
});

const getLocalOwner = () =>
  typeof localStorage === "undefined" ? null : localStorage.getItem(LOCAL_OWNER_KEY);

const setLocalOwner = (ownerId: string) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCAL_OWNER_KEY, ownerId);
  }
};

const clearLocalOwner = () => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LOCAL_OWNER_KEY);
  }
};

interface PortfolioContextValue {
  holdings: Holding[];
  settings: PortfolioSettings;
  summary: PortfolioSummary;
  analyses: HoldingAnalysis[];
  fxRates: CurrencyRateMap;
  fxUpdatedAt?: string;
  dcaPlans: DcaPlan[];
  loading: boolean;
  refreshStatus: RefreshStatus;
  refreshMessage: string;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncMessage: string;
  cloudUpdatedAt?: string;
  reload: () => Promise<void>;
  upsertHolding: (draft: HoldingDraft | Holding) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  adjustPosition: (input: PositionAdjustmentInput) => Promise<PositionAdjustmentResult>;
  queuePositionAdjustment: (input: QueuedPositionAdjustmentInput) => Promise<void>;
  updateSettings: (settings: PortfolioSettings) => Promise<void>;
  refreshAll: () => Promise<void>;
  upsertDcaPlan: (draft: DcaPlanDraft | DcaPlan) => Promise<void>;
  removeDcaPlan: (id: string) => Promise<void>;
  exportBackupData: () => Promise<BackupPayload>;
  importBackupData: (payload: BackupPayload) => Promise<void>;
  clearLocalData: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dcaPlans, setDcaPlans] = useState<DcaPlan[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS);
  const [fxRates, setFxRates] = useState<CurrencyRateMap>({ [DEFAULT_SETTINGS.baseCurrency]: 1 });
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | undefined>();
  const [fxLoading, setFxLoading] = useState(false);
  const [fxReady, setFxReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("local");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("未登录，仅保存在本机");
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | undefined>();
  const cloudHydratedUserRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const clearLocalData = useCallback(async () => {
    await clearLocalPortfolio();
    clearLocalOwner();
    setHoldings([]);
    setDcaPlans([]);
    setSettings(DEFAULT_SETTINGS);
    setRefreshStatus("idle");
    setRefreshMessage("");
    setCloudSyncStatus("local");
    setCloudSyncMessage("已退出，已清空本机缓存");
    setCloudUpdatedAt(undefined);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHoldings, nextSettings, nextDcaPlans] = await Promise.all([
        getHoldings(),
        getSettings(),
        getDcaPlans()
      ]);
      setHoldings(nextHoldings);
      setSettings(nextSettings);
      setDcaPlans(nextDcaPlans);
    } finally {
      setLocalLoaded(true);
      setLoading(false);
    }
  }, []);

  const syncCloudBackup = useCallback(async () => {
    if (!user) {
      setCloudSyncStatus("local");
      setCloudSyncMessage("未登录，仅保存在本机");
      setCloudUpdatedAt(undefined);
      return;
    }

    setLocalOwner(user.id);
    setCloudSyncStatus("syncing");
    setCloudSyncMessage("正在同步云端");

    try {
      const backup = await exportBackup();
      const result = await saveCloudPortfolio(backup);
      if (result.backup) {
        await importBackup(result.backup);
        const [nextHoldings, nextSettings, nextDcaPlans] = await Promise.all([
          getHoldings(),
          getSettings(),
          getDcaPlans()
        ]);
        setHoldings(nextHoldings);
        setSettings(nextSettings);
        setDcaPlans(nextDcaPlans);
      }
      setCloudSyncStatus("synced");
      setCloudSyncMessage("云端已同步");
      setCloudUpdatedAt(result.updatedAt);
    } catch (error) {
      setCloudSyncStatus("error");
      setCloudSyncMessage(error instanceof Error ? error.message : "云端同步失败");
    }
  }, [user]);

  const hydrateCloudPortfolio = useCallback(async () => {
    if (!user) return;

    const localOwner = getLocalOwner();
    const canUseLocalData = localOwner === user.id && (holdings.length > 0 || dcaPlans.length > 0);
    if (!canUseLocalData) {
      setLoading(true);
    }
    setCloudSyncStatus("syncing");
    setCloudSyncMessage("正在读取云端持仓");

    try {
      if (localOwner && localOwner !== user.id) {
        await clearLocalPortfolio();
        clearLocalOwner();
      }

      const result = await getCloudPortfolio();
      if (result.backup) {
        await importBackup(result.backup);
        setLocalOwner(user.id);
        const [nextHoldings, nextSettings, nextDcaPlans] = await Promise.all([
          getHoldings(),
          getSettings(),
          getDcaPlans()
        ]);
        setHoldings(nextHoldings);
        setSettings(nextSettings);
        setDcaPlans(nextDcaPlans);
        setCloudSyncMessage("已从云端恢复");
        setCloudUpdatedAt(result.updatedAt ?? undefined);
      } else {
        const saved = await saveCloudPortfolio(await exportBackup());
        setLocalOwner(user.id);
        setCloudSyncMessage("已创建云端备份");
        setCloudUpdatedAt(saved.updatedAt);
      }
      setCloudSyncStatus("synced");
    } catch (error) {
      setCloudSyncStatus("error");
      setCloudSyncMessage(error instanceof Error ? error.message : "云端同步失败");
    } finally {
      if (!canUseLocalData) {
        setLoading(false);
      }
    }
  }, [dcaPlans.length, holdings.length, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (authLoading || !localLoaded) return;

    if (!user) {
      cloudHydratedUserRef.current = null;
      if (previousUserIdRef.current || getLocalOwner()) {
        previousUserIdRef.current = null;
        void clearLocalData();
        return;
      }
      setCloudSyncStatus("local");
      setCloudSyncMessage("未登录，仅保存在本机");
      setCloudUpdatedAt(undefined);
      return;
    }

    if (cloudHydratedUserRef.current === user.id) return;
    previousUserIdRef.current = user.id;
    cloudHydratedUserRef.current = user.id;
    void hydrateCloudPortfolio();
  }, [authLoading, clearLocalData, hydrateCloudPortfolio, localLoaded, user]);

  const currencies = useMemo(
    () => Array.from(new Set([settings.baseCurrency, ...holdings.map((holding) => holding.currency)])),
    [holdings, settings.baseCurrency]
  );
  const currencyKey = currencies.join(",");

  useEffect(() => {
    let cancelled = false;
    setFxLoading(true);

    void getFxRates(settings.baseCurrency, currencies)
      .then((result) => {
        if (cancelled) return;
        setFxRates({
          ...result.rates,
          [settings.baseCurrency]: 1
        });
        setFxUpdatedAt(result.updatedAt);
        setFxReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFxRates((current) => ({
          ...current,
          [settings.baseCurrency]: 1
        }));
        setFxReady(true);
      })
      .finally(() => {
        if (!cancelled) setFxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currencyKey, currencies, settings.baseCurrency]);

  const summary = useMemo(() => calculatePortfolioSummary(holdings, fxRates), [fxRates, holdings]);
  const analyses = useMemo(
    () => analyzePortfolio(holdings, summary, settings, fxRates),
    [fxRates, holdings, settings, summary]
  );

  const upsertHolding = useCallback(async (draft: HoldingDraft | Holding) => {
    const saved = await saveHolding(draft);
    setHoldings((current) => {
      const existing = current.some((item) => item.id === saved.id);
      return existing
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current];
    });
    void syncCloudBackup();
  }, [syncCloudBackup]);

  const removeHolding = useCallback(async (id: string) => {
    await deleteHolding(id);
    setHoldings((current) => current.filter((item) => item.id !== id));
    void syncCloudBackup();
  }, [syncCloudBackup]);

  const adjustPosition = useCallback(
    async ({ holdingId, type, quantity, amount, price: manualPrice }: PositionAdjustmentInput) => {
      if (manualPrice !== undefined && (!Number.isFinite(manualPrice) || manualPrice <= 0)) {
        throw new Error("请输入大于 0 的价格");
      }

      const currentHoldings = await getHoldings();
      const holding = currentHoldings.find((item) => item.id === holdingId);
      if (!holding) {
        throw new Error("未找到该持仓");
      }

      const update = manualPrice === undefined ? await refreshHoldingPrice(holding) : undefined;
      const price = manualPrice ?? update?.currentPrice;
      if (price === undefined) {
        throw new Error("未查询到该资产的最新价格");
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("成交价格必须大于 0");
      }

      const hasQuantity = quantity !== undefined && Number.isFinite(quantity) && quantity > 0;
      const hasAmount = amount !== undefined && Number.isFinite(amount) && amount > 0;
      if (!hasQuantity && !hasAmount) {
        throw new Error("请输入大于 0 的数量或金额");
      }

      const adjustmentQuantity = roundPositionNumber(hasAmount ? Number(amount) / price : Number(quantity));
      if (!Number.isFinite(adjustmentQuantity) || adjustmentQuantity <= 0) {
        throw new Error("计算出的数量必须大于 0");
      }
      const cashDelta = roundPositionNumber(hasAmount ? Number(amount) : adjustmentQuantity * price);

      const refreshedHolding = recomputeHolding({
        ...holding,
        currentPrice: price,
        previousClose: update?.previousClose ?? holding.previousClose,
        dataSource: update?.source ?? holding.dataSource
      });

      if (type === "SELL" && adjustmentQuantity > refreshedHolding.quantity) {
        throw new Error("减仓数量不能大于当前持仓数量");
      }

      const cashHolding = currentHoldings.find(
        (item) => isCashHolding(item) && item.currency === refreshedHolding.currency
      );

      if (type === "BUY") {
        const cashBalance = cashHolding?.marketValue ?? cashHolding?.quantity ?? 0;
        if (!cashHolding || cashBalance < cashDelta) {
          throw new Error(
            `现金不足，需要先充钱。需要 ${cashDelta} ${refreshedHolding.currency}，当前 ${cashBalance} ${refreshedHolding.currency}`
          );
        }
      }

      const nextQuantity =
        type === "BUY"
          ? refreshedHolding.quantity + adjustmentQuantity
          : refreshedHolding.quantity - adjustmentQuantity;
      const nextAverageCost =
        type === "BUY"
          ? (refreshedHolding.quantity * refreshedHolding.averageCost + adjustmentQuantity * price) / nextQuantity
          : nextQuantity > 0
            ? refreshedHolding.averageCost
            : 0;

      const saved = await saveHolding({
        ...refreshedHolding,
        quantity: roundPositionNumber(nextQuantity),
        averageCost: roundPositionNumber(nextAverageCost),
        currentPrice: price,
        previousClose: update?.previousClose ?? refreshedHolding.previousClose
      });
      const nextCashQuantity =
        type === "BUY"
          ? roundPositionNumber((cashHolding?.quantity ?? 0) - cashDelta)
          : roundPositionNumber((cashHolding?.quantity ?? 0) + cashDelta);
      const savedCash = cashHolding
        ? await saveHolding({
            ...cashHolding,
            quantity: nextCashQuantity,
            averageCost: 1,
            currentPrice: 1,
            previousClose: 1,
            dataSource: "MANUAL"
          })
        : await saveHolding(createCashHoldingDraft(saved, cashDelta));
      const nextHoldings = currentHoldings.some((item) => item.id === savedCash.id)
        ? currentHoldings.map((item) => {
            if (item.id === saved.id) return saved;
            if (item.id === savedCash.id) return savedCash;
            return item;
          })
        : currentHoldings.map((item) => (item.id === saved.id ? saved : item)).concat(savedCash);
      await addSnapshot(nextHoldings);
      setHoldings(nextHoldings);
      void syncCloudBackup();

      return { holding: saved, price, quantity: adjustmentQuantity, amount: cashDelta };
    },
    [syncCloudBackup]
  );

  const queuePositionAdjustment = useCallback(
    async ({ holdingId, type, quantity, amount, executeAt }: QueuedPositionAdjustmentInput) => {
      if (!user) {
        throw new Error("请先登录账号，收盘价后台执行需要同步到云端");
      }

      const currentHoldings = await getHoldings();
      const holding = currentHoldings.find((item) => item.id === holdingId);
      if (!holding) {
        throw new Error("未找到该持仓");
      }
      if (holding.dataSource === "MANUAL") {
        throw new Error("手动录入资产无法使用收盘价后台执行");
      }

      const hasQuantity = quantity !== undefined && Number.isFinite(quantity) && quantity > 0;
      const hasAmount = amount !== undefined && Number.isFinite(amount) && amount > 0;
      if (!hasQuantity && !hasAmount) {
        throw new Error("请输入大于 0 的数量或金额");
      }

      const executeAtDate = new Date(executeAt);
      if (!Number.isFinite(executeAtDate.getTime())) {
        throw new Error("待执行时间无效");
      }

      const pending = await savePendingPositionAdjustment({
        holdingId: holding.id,
        holdingName: holding.name,
        symbol: holding.symbol,
        type,
        inputMode: hasAmount ? "AMOUNT" : "QUANTITY",
        amount: hasAmount ? Number(amount) : undefined,
        quantity: hasAmount ? undefined : Number(quantity),
        executeAt
      });

      setCloudSyncStatus("syncing");
      setCloudSyncMessage("正在同步待执行任务");

      try {
        const result = await saveCloudPortfolio(await exportBackup());
        if (result.backup) {
          await importBackup(result.backup);
          const [nextHoldings, nextSettings, nextDcaPlans] = await Promise.all([
            getHoldings(),
            getSettings(),
            getDcaPlans()
          ]);
          setHoldings(nextHoldings);
          setSettings(nextSettings);
          setDcaPlans(nextDcaPlans);
        }
        setCloudSyncStatus("synced");
        setCloudSyncMessage("待执行任务已同步云端");
        setCloudUpdatedAt(result.updatedAt);
      } catch (error) {
        await deletePendingPositionAdjustment(pending.id);
        setCloudSyncStatus("error");
        setCloudSyncMessage(error instanceof Error ? error.message : "待执行任务同步失败");
        throw error;
      }
    },
    [user]
  );

  const upsertDcaPlan = useCallback(
    async (draft: DcaPlanDraft | DcaPlan) => {
      const saved = await saveDcaPlan(draft);
      setDcaPlans((current) => {
        const existing = current.some((item) => item.id === saved.id);
        const next = existing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current];
        return next.slice().sort((first, second) => first.nextRunAt.localeCompare(second.nextRunAt));
      });
      void syncCloudBackup();
    },
    [syncCloudBackup]
  );

  const removeDcaPlan = useCallback(
    async (id: string) => {
      await deleteDcaPlan(id);
      setDcaPlans((current) => current.filter((item) => item.id !== id));
      void syncCloudBackup();
    },
    [syncCloudBackup]
  );

  const updateSettings = useCallback(async (nextSettings: PortfolioSettings) => {
    const saved = await saveSettings(nextSettings);
    setSettings(saved);
    void syncCloudBackup();
  }, [syncCloudBackup]);

  const refreshAll = useCallback(async () => {
    if (!holdings.length) {
      setRefreshStatus("success");
      setRefreshMessage("暂无持仓需要刷新");
      return;
    }

    const refreshableHoldings = holdings.filter(
      (holding) =>
        (holding.dataSource === "OKX" && settings.dataSources.okxEnabled) ||
        (holding.dataSource === "YAHOO" && settings.dataSources.yahooEnabled) ||
        (holding.dataSource === "EASTMONEY" && settings.dataSources.eastmoneyEnabled)
    );

    if (!refreshableHoldings.length) {
      setRefreshStatus("success");
      setRefreshMessage("没有启用自动刷新的持仓");
      return;
    }

    setRefreshStatus("loading");
    setRefreshMessage("正在刷新价格");
    try {
      const { result, holdings: updatedHoldings } = await refreshPrices(holdings, refreshableHoldings);
      setHoldings(updatedHoldings);
      setRefreshStatus(result.errors.length ? "partial" : "success");
      setRefreshMessage(result.errors.length ? "部分资产刷新失败" : "刷新成功");
      void syncCloudBackup();
    } catch (error) {
      setRefreshStatus("error");
      setRefreshMessage(error instanceof Error ? error.message : "刷新失败");
    }
  }, [
    holdings,
    settings.dataSources.eastmoneyEnabled,
    settings.dataSources.okxEnabled,
    settings.dataSources.yahooEnabled,
    syncCloudBackup
  ]);

  const exportBackupData = useCallback(() => exportBackup(), []);

  const importBackupData = useCallback(
    async (payload: BackupPayload) => {
      await importBackup(payload);
      await reload();
      void syncCloudBackup();
    },
    [reload, syncCloudBackup]
  );

  const value = useMemo<PortfolioContextValue>(
    () => ({
      holdings,
      settings,
      summary,
      analyses,
      fxRates,
      fxUpdatedAt,
      dcaPlans,
      loading: loading || (!fxReady && fxLoading),
      refreshStatus,
      refreshMessage,
      cloudSyncStatus,
      cloudSyncMessage,
      cloudUpdatedAt,
      reload,
      upsertHolding,
      removeHolding,
      adjustPosition,
      queuePositionAdjustment,
      updateSettings,
      refreshAll,
      upsertDcaPlan,
      removeDcaPlan,
      exportBackupData,
      importBackupData,
      clearLocalData
    }),
    [
      holdings,
      dcaPlans,
      settings,
      summary,
      analyses,
      fxRates,
      fxUpdatedAt,
      loading,
      fxLoading,
      fxReady,
      refreshStatus,
      refreshMessage,
      cloudSyncStatus,
      cloudSyncMessage,
      cloudUpdatedAt,
      reload,
      upsertHolding,
      removeHolding,
      adjustPosition,
      queuePositionAdjustment,
      updateSettings,
      refreshAll,
      upsertDcaPlan,
      removeDcaPlan,
      exportBackupData,
      importBackupData,
      clearLocalData
    ]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error("usePortfolio must be used inside PortfolioProvider");
  }
  return context;
};
