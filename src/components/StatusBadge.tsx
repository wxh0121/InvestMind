import type { ReactNode } from "react";
import { cn } from "@/utils/format";

interface StatusBadgeProps {
  tone?: "neutral" | "profit" | "loss" | "warning" | "accent";
  children: ReactNode;
}

const toneClass = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  profit: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  loss: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  accent: "bg-coral-50 text-coral-700 dark:bg-coral-950 dark:text-coral-200"
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={cn("chip", toneClass[tone])}>{children}</span>;
}
