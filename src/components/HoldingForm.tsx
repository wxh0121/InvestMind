import { type FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  ASSET_TYPES,
  CURRENCIES,
  DATA_SOURCES,
  DATA_SOURCE_LABELS,
  MARKETS,
  type AssetType,
  type Currency,
  type DataSource,
  type Holding,
  type HoldingDraft,
  type Market
} from "@/types/holding";

interface HoldingFormProps {
  open: boolean;
  holding?: Holding | null;
  onClose: () => void;
  onSubmit: (draft: HoldingDraft | Holding) => Promise<void>;
}

const emptyDraft: HoldingDraft = {
  name: "",
  symbol: "",
  market: "US_STOCK",
  assetType: "STOCK",
  currency: "USD",
  quantity: 0,
  averageCost: 0,
  currentPrice: 0,
  previousClose: 0,
  dataSource: "YAHOO",
  note: ""
};

const isDomesticFundType = (assetType: AssetType) =>
  assetType === "INDEX_FUND" || assetType === "SECTOR_FUND";

const getAssetTypeOptions = (market: Market) =>
  market === "CASH"
    ? ASSET_TYPES.filter((item) => item.value === "CASH")
    : market === "CRYPTO"
      ? ASSET_TYPES.filter((item) => item.value === "CRYPTO")
      : ASSET_TYPES.filter((item) => item.value !== "CRYPTO" && item.value !== "CASH");

const normalizeAssetTypeForMarket = (assetType: AssetType, market: Market): AssetType => {
  if (market === "CASH") return "CASH";
  if (market === "CRYPTO") return "CRYPTO";
  return assetType === "CRYPTO" || assetType === "CASH" ? "STOCK" : assetType;
};

const defaultDataSourceForHolding = (market: Market, assetType: AssetType): DataSource => {
  if (market === "CASH") return "MANUAL";
  if (market === "CRYPTO") return "OKX";
  if (isDomesticFundType(assetType)) return "EASTMONEY";
  return "YAHOO";
};

const defaultCurrencyForHolding = (market: Market, assetType: AssetType): Currency => {
  if (market === "CASH") return "CNY";
  if (isDomesticFundType(assetType) || market === "A_SHARE") return "CNY";
  if (market === "HK_STOCK") return "HKD";
  return "USD";
};

const cashSymbol = (currency: Currency) => `CASH-${currency}`;

const normalizeCashDraft = (draft: HoldingDraft | Holding): HoldingDraft | Holding => {
  if (draft.market !== "CASH") return draft;

  return {
    ...draft,
    name: draft.name.trim() || `${draft.currency} 现金`,
    symbol: cashSymbol(draft.currency),
    assetType: "CASH",
    quantity: draft.quantity,
    averageCost: 1,
    currentPrice: 1,
    previousClose: 1,
    dataSource: "MANUAL"
  };
};

export function HoldingForm({ open, holding, onClose, onSubmit }: HoldingFormProps) {
  const [draft, setDraft] = useState<HoldingDraft | Holding>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const assetTypeOptions = getAssetTypeOptions(draft.market);
  const isCash = draft.market === "CASH";

  useEffect(() => {
    setDraft(holding ?? emptyDraft);
  }, [holding, open]);

  if (!open) return null;

  const updateDraft = <K extends keyof HoldingDraft>(key: K, value: HoldingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateMarket = (market: Market) => {
    const nextAssetType = normalizeAssetTypeForMarket(draft.assetType, market);
    const nextCurrency = defaultCurrencyForHolding(market, nextAssetType);
    setDraft((current) => ({
      ...current,
      assetType: normalizeAssetTypeForMarket(current.assetType, market),
      market,
      currency: defaultCurrencyForHolding(market, normalizeAssetTypeForMarket(current.assetType, market)),
      dataSource: defaultDataSourceForHolding(market, normalizeAssetTypeForMarket(current.assetType, market)),
      name: market === "CASH" && !current.name ? `${nextCurrency} 现金` : current.name,
      symbol: market === "CASH" ? cashSymbol(nextCurrency) : current.symbol,
      averageCost: market === "CASH" ? 1 : current.averageCost,
      currentPrice: market === "CASH" ? 1 : current.currentPrice,
      previousClose: market === "CASH" ? 1 : current.previousClose
    }));
  };

  const updateAssetType = (assetType: AssetType) => {
    setDraft((current) => ({
      ...current,
      assetType: normalizeAssetTypeForMarket(assetType, current.market),
      currency: defaultCurrencyForHolding(current.market, normalizeAssetTypeForMarket(assetType, current.market)),
      dataSource: defaultDataSourceForHolding(current.market, normalizeAssetTypeForMarket(assetType, current.market))
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const normalizedDraft = normalizeCashDraft(draft);
      await onSubmit({
        ...normalizedDraft,
        symbol: normalizedDraft.symbol.trim().toUpperCase(),
        name: normalizedDraft.name.trim(),
        previousClose: normalizedDraft.previousClose || normalizedDraft.currentPrice
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <form className="surface max-h-[92vh] w-full max-w-3xl overflow-y-auto p-4 sm:p-5" onSubmit={submit}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {holding ? "编辑持仓" : "新增持仓"}
          </h2>
          <button className="btn-secondary h-9 w-9 px-0" type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {!isCash ? (
            <label className="space-y-1.5">
              <span className="label">资产名称</span>
              <input
                className="input"
                required
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Tesla"
              />
            </label>
          ) : null}
          {!isCash ? (
            <label className="space-y-1.5">
              <span className="label">资产代码</span>
              <input
                className="input"
                required
                value={draft.symbol}
                onChange={(event) => updateDraft("symbol", event.target.value)}
                placeholder="TSLA"
              />
            </label>
          ) : null}
          <label className="space-y-1.5">
            <span className="label">市场</span>
            <select
              className="input"
              value={draft.market}
              onChange={(event) => updateMarket(event.target.value as Market)}
            >
              {MARKETS.map((market) => (
                <option key={market.value} value={market.value}>
                  {market.label}
                </option>
              ))}
            </select>
          </label>
          {!isCash ? (
            <label className="space-y-1.5">
              <span className="label">资产类型</span>
              <select
                className="input"
                value={draft.assetType}
                onChange={(event) => updateAssetType(event.target.value as AssetType)}
              >
                {assetTypeOptions.map((assetType) => (
                  <option key={assetType.value} value={assetType.value}>
                    {assetType.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1.5">
            <span className="label">计价货币</span>
            <select
              className="input"
              value={draft.currency}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  currency: event.target.value as Currency,
                  symbol: current.market === "CASH" ? cashSymbol(event.target.value as Currency) : current.symbol,
                  name: current.market === "CASH" ? `${event.target.value} 现金` : current.name
                }))
              }
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          {!isCash ? (
            <label className="space-y-1.5">
              <span className="label">数据来源</span>
              <select
                className="input"
                value={draft.dataSource}
                onChange={(event) => updateDraft("dataSource", event.target.value as DataSource)}
              >
                {DATA_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {DATA_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1.5">
            <span className="label">{isCash ? "金额" : "持仓数量"}</span>
            <input
              className="input"
              min="0"
              step="0.00000001"
              type="number"
              value={draft.quantity}
              onChange={(event) => updateDraft("quantity", Number(event.target.value))}
            />
          </label>
          {!isCash ? (
            <>
              <label className="space-y-1.5">
                <span className="label">平均成本</span>
                <input
                  className="input"
                  min="0"
                  step="0.00000001"
                  type="number"
                  value={draft.averageCost}
                  onChange={(event) => updateDraft("averageCost", Number(event.target.value))}
                />
              </label>
              <label className="space-y-1.5">
                <span className="label">当前价格</span>
                <input
                  className="input"
                  min="0"
                  step="0.00000001"
                  type="number"
                  value={draft.currentPrice}
                  onChange={(event) => updateDraft("currentPrice", Number(event.target.value))}
                />
              </label>
              <label className="space-y-1.5">
                <span className="label">昨日价格</span>
                <input
                  className="input"
                  min="0"
                  step="0.00000001"
                  type="number"
                  value={draft.previousClose}
                  onChange={(event) => updateDraft("previousClose", Number(event.target.value))}
                />
              </label>
            </>
          ) : null}
          <label className="space-y-1.5 sm:col-span-2">
            <span className="label">备注</span>
            <textarea
              className="input min-h-24 py-2"
              value={draft.note ?? ""}
              onChange={(event) => updateDraft("note", event.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
