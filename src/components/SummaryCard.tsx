import type { ReactNode } from "react";
import { cn } from "@/utils/format";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: "neutral" | "profit" | "loss" | "accent";
}

const toneClass = {
  neutral: "text-slate-900 dark:text-slate-50",
  profit: "text-emerald-600 dark:text-emerald-300",
  loss: "text-rose-600 dark:text-rose-300",
  accent: "text-coral-700 dark:text-coral-300"
};

export function SummaryCard({ title, value, subtitle, icon, tone = "neutral" }: SummaryCardProps) {
  return (
    <section className="surface surface-hover p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className={cn("mt-1 truncate text-lg font-semibold leading-6 sm:text-xl", toneClass[tone])}>{value}</p>
        </div>
        {icon ? (
          <div className="rounded-lg bg-coral-50 p-1.5 text-coral-700 dark:bg-coral-950 dark:text-coral-300">
            {icon}
          </div>
        ) : null}
      </div>
      {subtitle ? <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
    </section>
  );
}
