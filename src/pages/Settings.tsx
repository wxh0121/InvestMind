import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, FileJson, Save, Upload } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/context/PortfolioContext";
import { CURRENCIES, MARKETS, type Currency, type Market } from "@/types/holding";
import type { BackupPayload } from "@/services/portfolioService";
import { holdingsToCsv, downloadTextFile } from "@/utils/csv";

type ApiStatus = "idle" | "ok" | "error" | "loading";

const statusText: Record<ApiStatus, string> = {
  idle: "未测试",
  ok: "正常",
  error: "失败",
  loading: "测试中"
};

export function SettingsPage() {
  const {
    holdings,
    settings,
    updateSettings,
    exportBackupData,
    importBackupData
  } = usePortfolio();
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [apiStatus, setApiStatus] = useState<Record<string, ApiStatus>>({
    health: "idle",
    okx: "idle",
    yahoo: "idle",
    funds: "idle"
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateTarget = (market: Market, value: number) => {
    setDraft((current) => ({
      ...current,
      targetAllocationByMarket: {
        ...current.targetAllocationByMarket,
        [market]: value
      }
    }));
  };

  const save = async () => {
    await updateSettings(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const exportJson = async () => {
    const backup = await exportBackupData();
    downloadTextFile(
      `investment-diary-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2)
    );
  };

  const exportCsv = () => {
    downloadTextFile(
      `investment-diary-holdings-${new Date().toISOString().slice(0, 10)}.csv`,
      holdingsToCsv(holdings),
      "text/csv;charset=utf-8"
    );
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importBackupData(JSON.parse(text) as BackupPayload);
    event.target.value = "";
  };

  const testEndpoint = async (key: "health" | "okx" | "yahoo" | "funds", url: string) => {
    setApiStatus((current) => ({ ...current, [key]: "loading" }));
    try {
      const response = await fetch(url);
      setApiStatus((current) => ({ ...current, [key]: response.ok ? "ok" : "error" }));
    } catch {
      setApiStatus((current) => ({ ...current, [key]: "error" }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">设置</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">目标配置、数据源与本地备份</p>
        </div>
        <button className="btn-primary" type="button" onClick={save}>
          <Save className="h-4 w-4" />
          {saved ? "已保存" : "保存设置"}
        </button>
      </div>

      <section className="surface surface-hover p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">基础配置</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="label">基础货币</span>
            <select
              className="input"
              value={draft.baseCurrency}
              onChange={(event) => setDraft((current) => ({ ...current, baseCurrency: event.target.value as Currency }))}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="label">最大单资产占比</span>
            <input
              className="input"
              min="0"
              max="100"
              step="1"
              type="number"
              value={draft.maxSingleAssetPercent}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxSingleAssetPercent: Number(event.target.value) }))
              }
            />
          </label>
        </div>
      </section>

      <section className="surface surface-hover p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">目标资产配置比例</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETS.map((market) => (
            <label key={market.value} className="space-y-1.5">
              <span className="label">{market.label}</span>
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  min="0"
                  max="100"
                  step="1"
                  type="number"
                  value={draft.targetAllocationByMarket[market.value]}
                  onChange={(event) => updateTarget(market.value, Number(event.target.value))}
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="surface surface-hover p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">数据源</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">OKX</span>
            <input
              className="h-5 w-5 accent-coral-600"
              type="checkbox"
              checked={draft.dataSources.okxEnabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dataSources: { ...current.dataSources, okxEnabled: event.target.checked }
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Yahoo Finance</span>
            <input
              className="h-5 w-5 accent-coral-600"
              type="checkbox"
              checked={draft.dataSources.yahooEnabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dataSources: { ...current.dataSources, yahooEnabled: event.target.checked }
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">天天基金/东财基金</span>
            <input
              className="h-5 w-5 accent-coral-600"
              type="checkbox"
              checked={draft.dataSources.eastmoneyEnabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dataSources: { ...current.dataSources, eastmoneyEnabled: event.target.checked }
                }))
              }
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <button className="btn-secondary justify-between" type="button" onClick={() => testEndpoint("health", "/api/health")}>
            Health
            <StatusBadge tone={apiStatus.health === "ok" ? "profit" : apiStatus.health === "error" ? "loss" : "neutral"}>
              {statusText[apiStatus.health]}
            </StatusBadge>
          </button>
          <button className="btn-secondary justify-between" type="button" onClick={() => testEndpoint("okx", "/api/okx/prices?symbols=BTC")}>
            OKX
            <StatusBadge tone={apiStatus.okx === "ok" ? "profit" : apiStatus.okx === "error" ? "loss" : "neutral"}>
              {statusText[apiStatus.okx]}
            </StatusBadge>
          </button>
          <button
            className="btn-secondary justify-between"
            type="button"
            onClick={() => testEndpoint("yahoo", "/api/yahoo/prices?symbols=TSLA,600519.SS,0700.HK,%5EGSPC")}
          >
            Yahoo
            <StatusBadge tone={apiStatus.yahoo === "ok" ? "profit" : apiStatus.yahoo === "error" ? "loss" : "neutral"}>
              {statusText[apiStatus.yahoo]}
            </StatusBadge>
          </button>
          <button
            className="btn-secondary justify-between"
            type="button"
            onClick={() => testEndpoint("funds", "/api/funds/prices?symbols=020973")}
          >
            基金
            <StatusBadge tone={apiStatus.funds === "ok" ? "profit" : apiStatus.funds === "error" ? "loss" : "neutral"}>
              {statusText[apiStatus.funds]}
            </StatusBadge>
          </button>
        </div>
      </section>

      <section className="surface surface-hover p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">数据备份</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button className="btn-secondary" type="button" onClick={exportJson}>
            <FileJson className="h-4 w-4" />
            导出 JSON
          </button>
          <button className="btn-secondary" type="button" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            导出 CSV
          </button>
          <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            导入 JSON
          </button>
          <input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json" onChange={importJson} />
        </div>
      </section>
    </div>
  );
}
