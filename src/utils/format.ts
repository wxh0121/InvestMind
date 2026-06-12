import type { Currency } from "@/types/holding";

const currencyLocales: Record<Currency, string> = {
  CNY: "zh-CN",
  USD: "en-US",
  HKD: "zh-HK",
  EUR: "de-DE",
  JPY: "ja-JP",
  SGD: "en-SG",
  OTHER: "zh-CN"
};

export const formatCurrency = (value: number, currency: Currency = "CNY") =>
  new Intl.NumberFormat(currencyLocales[currency] ?? "zh-CN", {
    style: currency === "OTHER" ? "decimal" : "currency",
    currency: currency === "OTHER" ? undefined : currency,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);

export const formatCompactCurrency = (value: number, currency: Currency = "CNY") =>
  new Intl.NumberFormat(currencyLocales[currency] ?? "zh-CN", {
    style: currency === "OTHER" ? "decimal" : "currency",
    currency: currency === "OTHER" ? undefined : currency,
    notation: "compact",
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number) =>
  `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

export const formatDateTime = (iso?: string) => {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
};

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");
