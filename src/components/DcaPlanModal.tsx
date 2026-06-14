import { type FormEvent, useMemo, useState } from "react";
import { CalendarClock, Pause, Play, Trash2, X } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  DCA_FREQUENCY_LABELS,
  DCA_INPUT_MODE_LABELS,
  WEEKDAY_LABELS,
  type DcaFrequency,
  type DcaInputMode,
  type DcaPlan
} from "@/types/dcaPlan";
import type { Holding } from "@/types/holding";
import { cn } from "@/utils/format";
import {
  DCA_EXECUTION_HOUR,
  DCA_EXECUTION_TIME_LABEL,
  computeNextDcaRunAt,
  describeDcaSchedule,
  formatDcaDateTime
} from "@/utils/dcaSchedule";

interface DcaPlanModalProps {
  open: boolean;
  onClose: () => void;
}

interface SelectedConfig {
  inputMode: DcaInputMode;
  amount: string;
  quantity: string;
}

const weekdays = [1, 2, 3, 4, 5];
const months = Array.from({ length: 12 }, (_, index) => index + 1);

const isEligibleHolding = (holding: Holding) =>
  holding.market !== "CASH" && holding.assetType !== "CASH" && holding.dataSource !== "MANUAL";

const planAmountText = (plan: DcaPlan) =>
  plan.inputMode === "AMOUNT"
    ? `金额 ${plan.amount?.toLocaleString("zh-CN") ?? "-"}`
    : `数量 ${plan.quantity?.toLocaleString("zh-CN", { maximumFractionDigits: 8 }) ?? "-"}`;

export function DcaPlanModal({ open, onClose }: DcaPlanModalProps) {
  const { holdings, dcaPlans, upsertDcaPlan, removeDcaPlan } = usePortfolio();
  const [selected, setSelected] = useState<Record<string, SelectedConfig>>({});
  const [frequency, setFrequency] = useState<DcaFrequency>("DAILY");
  const [weekday, setWeekday] = useState(1);
  const [month, setMonth] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const eligibleHoldings = useMemo(() => holdings.filter(isEligibleHolding), [holdings]);
  const selectedEntries = Object.entries(selected);

  if (!open) return null;

  const toggleHolding = (holding: Holding, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (checked) {
        next[holding.id] = next[holding.id] ?? {
          inputMode: "AMOUNT",
          amount: "",
          quantity: ""
        };
      } else {
        delete next[holding.id];
      }
      return next;
    });
    setMessage("");
    setError("");
  };

  const updateSelected = (holdingId: string, patch: Partial<SelectedConfig>) => {
    setSelected((current) => ({
      ...current,
      [holdingId]: {
        ...current[holdingId],
        ...patch
      }
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!selectedEntries.length) {
        throw new Error("请选择至少一个持仓");
      }

      for (const [holdingId, config] of selectedEntries) {
        const holding = eligibleHoldings.find((item) => item.id === holdingId);
        if (!holding) continue;
        const amount = Number(config.amount);
        const quantity = Number(config.quantity);
        if (config.inputMode === "AMOUNT" && (!Number.isFinite(amount) || amount <= 0)) {
          throw new Error(`${holding.name} 的定投金额必须大于 0`);
        }
        if (config.inputMode === "QUANTITY" && (!Number.isFinite(quantity) || quantity <= 0)) {
          throw new Error(`${holding.name} 的定投数量必须大于 0`);
        }

        const schedule = {
          frequency,
          hour: DCA_EXECUTION_HOUR,
          weekday: frequency === "WEEKLY" ? weekday : undefined,
          month: frequency === "MONTHLY" ? month : undefined
        };

        await upsertDcaPlan({
          holdingId: holding.id,
          holdingName: holding.name,
          symbol: holding.symbol,
          inputMode: config.inputMode,
          amount: config.inputMode === "AMOUNT" ? amount : undefined,
          quantity: config.inputMode === "QUANTITY" ? quantity : undefined,
          ...schedule,
          nextRunAt: computeNextDcaRunAt(schedule)
        });
      }

      setSelected({});
      setMessage("定投计划已保存");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (plan: DcaPlan) => {
    await upsertDcaPlan({
      ...plan,
      enabled: !plan.enabled,
      nextRunAt: !plan.enabled ? computeNextDcaRunAt(plan) : plan.nextRunAt
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto bg-slate-950/50 px-3 py-6 backdrop-blur-sm sm:px-4">
      <form className="surface my-auto max-h-[calc(100dvh-3rem)] w-full max-w-4xl overflow-y-auto p-4 sm:p-5" onSubmit={submit}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-coral-600 dark:text-coral-300" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">定投</h2>
          </div>
          <button className="btn-secondary h-9 w-9 px-0" type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">新建计划</h3>
            <div className="space-y-3">
              {eligibleHoldings.length ? (
                eligibleHoldings.map((holding) => {
                  const config = selected[holding.id];
                  return (
                    <div key={holding.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <label className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                            {holding.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                            {holding.symbol} · {holding.currency}
                          </span>
                        </span>
                        <input
                          className="h-5 w-5 shrink-0 accent-coral-600"
                          type="checkbox"
                          checked={Boolean(config)}
                          onChange={(event) => toggleHolding(holding, event.target.checked)}
                          disabled={saving}
                        />
                      </label>

                      {config ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
                          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 sm:grid-cols-1">
                            {(["AMOUNT", "QUANTITY"] as DcaInputMode[]).map((mode) => (
                              <button
                                key={mode}
                                className={cn(
                                  "h-9 rounded-lg text-sm font-medium transition",
                                  config.inputMode === mode
                                    ? "bg-[#FFFDF8] text-slate-950 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                                    : "text-slate-600 hover:bg-[#FFFDF8]/70 dark:text-slate-300 dark:hover:bg-slate-900/70"
                                )}
                                type="button"
                                onClick={() => updateSelected(holding.id, { inputMode: mode })}
                                disabled={saving}
                              >
                                {DCA_INPUT_MODE_LABELS[mode]}
                              </button>
                            ))}
                          </div>
                          <label className="space-y-1.5">
                            <span className="label">
                              {config.inputMode === "AMOUNT" ? `定投金额（${holding.currency}）` : "定投数量"}
                            </span>
                            <input
                              className="input"
                              min="0"
                              step={config.inputMode === "AMOUNT" ? "0.01" : "0.00000001"}
                              type="number"
                              value={config.inputMode === "AMOUNT" ? config.amount : config.quantity}
                              onChange={(event) =>
                                updateSelected(
                                  holding.id,
                                  config.inputMode === "AMOUNT"
                                    ? { amount: event.target.value }
                                    : { quantity: event.target.value }
                                )
                              }
                              disabled={saving}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  暂无可定投资产
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">周期</h3>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(["DAILY", "WEEKLY", "MONTHLY"] as DcaFrequency[]).map((item) => (
                  <button
                    key={item}
                    className={cn(
                      "h-9 rounded-lg text-sm font-medium transition",
                      frequency === item
                        ? "bg-[#FFFDF8] text-slate-950 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                        : "text-slate-600 hover:bg-[#FFFDF8]/70 dark:text-slate-300 dark:hover:bg-slate-900/70"
                    )}
                    type="button"
                    onClick={() => setFrequency(item)}
                  >
                    {DCA_FREQUENCY_LABELS[item]}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {frequency === "DAILY" ? (
                  <div className="rounded-lg border border-slate-200 bg-[#FFFDF8] px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                    每个交易日 {DCA_EXECUTION_TIME_LABEL}
                  </div>
                ) : null}

                {frequency === "WEEKLY" ? (
                  <label className="space-y-1.5">
                    <span className="label">星期</span>
                    <select className="input" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                      {weekdays.map((item) => (
                        <option key={item} value={item}>
                          {WEEKDAY_LABELS[item]} {DCA_EXECUTION_TIME_LABEL}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {frequency === "MONTHLY" ? (
                  <label className="space-y-1.5">
                    <span className="label">月份</span>
                    <select className="input" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                      {months.map((item) => (
                        <option key={item} value={item}>
                          {item} 月 1 日 {DCA_EXECUTION_TIME_LABEL}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">已有计划</h3>
              <div className="space-y-2">
                {dcaPlans.length ? (
                  dcaPlans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                            {plan.holdingName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {plan.symbol} · {planAmountText(plan)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button className="btn-secondary h-8 w-8 px-0" type="button" onClick={() => void togglePlan(plan)}>
                            {plan.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </button>
                          <button className="btn-danger h-8 w-8 px-0" type="button" onClick={() => void removeDcaPlan(plan.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <p>{describeDcaSchedule(plan)} · 下次 {formatDcaDateTime(plan.nextRunAt)}</p>
                        {plan.lastMessage ? (
                          <p className={plan.lastStatus === "FAILED" ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}>
                            {plan.lastMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    暂无定投计划
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            关闭
          </button>
          <button className="btn-primary" type="submit" disabled={saving || !selectedEntries.length}>
            {saving ? "保存中" : "保存定投"}
          </button>
        </div>
      </form>
    </div>
  );
}
