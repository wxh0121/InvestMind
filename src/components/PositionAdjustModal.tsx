import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import type { Holding } from "@/types/holding";
import { cn, formatCurrency } from "@/utils/format";

type PositionAdjustmentType = "BUY" | "SELL";
type PositionInputMode = "QUANTITY" | "AMOUNT";

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const CLOSE_PRICE_HOUR = 15;
const CLOSE_PRICE_MINUTE = 30;
const CLOSE_PRICE_LABEL = "15:30";

interface PositionAdjustModalProps {
  open: boolean;
  type: PositionAdjustmentType;
  onClose: () => void;
}

const isTradable = (holding: Holding, type: PositionAdjustmentType) => {
  if (holding.dataSource === "MANUAL") return false;
  if (type === "SELL") return holding.quantity > 0;
  return true;
};

const isFundHolding = (holding?: Holding) =>
  holding?.assetType === "INDEX_FUND" || holding?.assetType === "SECTOR_FUND";

const getChinaCloseTime = (from = new Date()) => {
  const shifted = new Date(from.getTime() + CHINA_TIME_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      CLOSE_PRICE_HOUR - 8,
      CLOSE_PRICE_MINUTE,
      0,
      0
    )
  );
};

const isBeforeChinaClose = (from = new Date()) => from.getTime() < getChinaCloseTime(from).getTime();

export function PositionAdjustModal({ open, type, onClose }: PositionAdjustModalProps) {
  const { holdings, adjustPosition } = usePortfolio();
  const [holdingId, setHoldingId] = useState("");
  const [inputMode, setInputMode] = useState<PositionInputMode>("QUANTITY");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [manualPriceEnabled, setManualPriceEnabled] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [closePriceEnabled, setClosePriceEnabled] = useState(false);
  const [waitingForClose, setWaitingForClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionLabel = type === "BUY" ? "加仓" : "减仓";
  const closePriceLabel = `收盘价格${actionLabel}`;
  const eligibleHoldings = useMemo(
    () => holdings.filter((holding) => isTradable(holding, type)),
    [holdings, type]
  );
  const selectedHolding = eligibleHoldings.find((holding) => holding.id === holdingId);
  const formLocked = saving || waitingForClose;
  const estimatedPrice = manualPriceEnabled ? Number(manualPrice) : (selectedHolding?.currentPrice ?? 0);
  const estimatedAmount = Number(amount);
  const estimatedQuantity =
    inputMode === "AMOUNT" && Number.isFinite(estimatedAmount) && estimatedAmount > 0 && estimatedPrice > 0
      ? estimatedAmount / estimatedPrice
      : 0;
  const currentInputValue = inputMode === "QUANTITY" ? quantity : amount;
  const numericInputValue = Number(currentInputValue);
  const numericManualPrice = Number(manualPrice);
  const submitDisabled =
    !holdingId ||
    !Number.isFinite(numericInputValue) ||
    numericInputValue <= 0 ||
    (manualPriceEnabled && (!Number.isFinite(numericManualPrice) || numericManualPrice <= 0)) ||
    formLocked;

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!open) {
      setWaitingForClose(false);
      setSaving(false);
      return;
    }
    setHoldingId(eligibleHoldings[0]?.id ?? "");
    setInputMode("QUANTITY");
    setQuantity("");
    setAmount("");
    setManualPriceEnabled(false);
    setManualPrice("");
    setClosePriceEnabled(false);
    setWaitingForClose(false);
    setSaving(false);
    setMessage("");
    setError("");
  }, [eligibleHoldings, open, type]);

  useEffect(() => {
    if (!open) return;
    setClosePriceEnabled(isFundHolding(selectedHolding));
    setManualPriceEnabled(false);
    setManualPrice("");
  }, [holdingId, open, selectedHolding]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const executeAdjustment = async () => {
      setWaitingForClose(false);
      setSaving(true);
      const result = await adjustPosition({
        holdingId,
        type,
        quantity: inputMode === "QUANTITY" ? Number(quantity) : undefined,
        amount: inputMode === "AMOUNT" ? Number(amount) : undefined,
        price: manualPriceEnabled ? Number(manualPrice) : undefined
      });
      setQuantity("");
      setAmount("");
      setManualPrice("");
      setMessage(
        `${actionLabel}成功，成交价 ${formatCurrency(result.price, result.holding.currency)}，成交数量 ${result.quantity.toLocaleString("zh-CN")}，成交金额 ${formatCurrency(result.amount, result.holding.currency)}，当前数量 ${result.holding.quantity}`
      );
      setSaving(false);
    };

    try {
      if (closePriceEnabled && !manualPriceEnabled && isBeforeChinaClose()) {
        const closeAt = getChinaCloseTime();
        const delay = closeAt.getTime() - Date.now();
        setWaitingForClose(true);
        setMessage(`已等待至今日 ${CLOSE_PRICE_LABEL} 执行${actionLabel}，请保持当前页面开启。`);
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          void executeAdjustment().catch((delayedError) => {
            setSaving(false);
            setWaitingForClose(false);
            setError(delayedError instanceof Error ? delayedError.message : `${actionLabel}失败`);
          });
        }, delay);
        return;
      }

      await executeAdjustment();
    } catch (submitError) {
      setSaving(false);
      setWaitingForClose(false);
      setError(submitError instanceof Error ? submitError.message : `${actionLabel}失败`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <form className="surface w-full max-w-lg p-4 sm:p-5" onSubmit={submit}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{actionLabel}</h2>
          <button className="btn-secondary h-9 w-9 px-0" type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="space-y-1.5">
            <span className="label">持仓资产</span>
            <select
              className="input"
              value={holdingId}
              onChange={(event) => setHoldingId(event.target.value)}
              disabled={!eligibleHoldings.length || formLocked}
            >
              {eligibleHoldings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name} · {holding.symbol}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
            <button
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition",
                inputMode === "QUANTITY"
                  ? "bg-[#FFFDF8] text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                  : "text-slate-600 hover:bg-[#FFFDF8]/70 dark:text-slate-300 dark:hover:bg-slate-800/70"
              )}
              type="button"
              onClick={() => setInputMode("QUANTITY")}
              disabled={formLocked}
            >
              按数量
            </button>
            <button
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition",
                inputMode === "AMOUNT"
                  ? "bg-[#FFFDF8] text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50"
                  : "text-slate-600 hover:bg-[#FFFDF8]/70 dark:text-slate-300 dark:hover:bg-slate-800/70"
              )}
              type="button"
              onClick={() => setInputMode("AMOUNT")}
              disabled={formLocked}
            >
              按金额
            </button>
          </div>

          <label className="space-y-1.5">
            <span className="label">{inputMode === "QUANTITY" ? `${actionLabel}数量` : `${actionLabel}金额`}</span>
            <input
              className="input"
              min="0"
              max={inputMode === "QUANTITY" && type === "SELL" ? selectedHolding?.quantity : undefined}
              step={inputMode === "QUANTITY" ? "0.00000001" : "0.01"}
              type="number"
              value={inputMode === "QUANTITY" ? quantity : amount}
              onChange={(event) =>
                inputMode === "QUANTITY" ? setQuantity(event.target.value) : setAmount(event.target.value)
              }
              disabled={!eligibleHoldings.length || formLocked}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{closePriceLabel}</span>
            <input
              className="h-5 w-5 accent-coral-600"
              type="checkbox"
              checked={closePriceEnabled}
              onChange={(event) => {
                setClosePriceEnabled(event.target.checked);
                if (event.target.checked) {
                  setManualPriceEnabled(false);
                  setManualPrice("");
                }
              }}
              disabled={!eligibleHoldings.length || formLocked || manualPriceEnabled}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">手动输入成交价</span>
            <input
              className="h-5 w-5 accent-coral-600"
              type="checkbox"
              checked={manualPriceEnabled}
              onChange={(event) => {
                setManualPriceEnabled(event.target.checked);
                if (event.target.checked) {
                  setClosePriceEnabled(false);
                }
              }}
              disabled={!eligibleHoldings.length || formLocked || closePriceEnabled}
            />
          </label>

          {manualPriceEnabled ? (
            <label className="space-y-1.5">
              <span className="label">{actionLabel}价格</span>
              <input
                className="input"
                min="0"
                step="0.00000001"
                type="number"
                value={manualPrice}
                onChange={(event) => setManualPrice(event.target.value)}
                disabled={!eligibleHoldings.length || formLocked}
              />
            </label>
          ) : null}

          {selectedHolding ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>当前数量</span>
                <span className="font-medium text-slate-900 dark:text-slate-50">{selectedHolding.quantity}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>当前价</span>
                <span className="font-medium text-slate-900 dark:text-slate-50">
                  {formatCurrency(selectedHolding.currentPrice, selectedHolding.currency)}
                </span>
              </div>
              {inputMode === "AMOUNT" ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>预计{actionLabel}数量</span>
                  <span className="font-medium text-slate-900 dark:text-slate-50">
                    {estimatedQuantity > 0 ? estimatedQuantity.toLocaleString("zh-CN", { maximumFractionDigits: 8 }) : "-"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              暂无可{actionLabel}资产
            </div>
          )}

          {message ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{message}</p> : null}
          {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            className="btn-primary"
            type="submit"
            disabled={submitDisabled}
          >
            {waitingForClose ? "等待收盘" : saving ? "处理中" : `确认${actionLabel}`}
          </button>
        </div>
      </form>
    </div>
  );
}
