import { RefreshCcw } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn } from "@/utils/format";

export function RefreshButton() {
  const { refreshAll, refreshStatus, refreshMessage } = usePortfolio();
  const loading = refreshStatus === "loading";

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <button className="btn-primary" type="button" onClick={refreshAll} disabled={loading}>
        <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
        一键刷新
      </button>
      {refreshMessage ? (
        <span
          className={cn(
            "text-sm",
            refreshStatus === "success" && "text-emerald-600 dark:text-emerald-300",
            refreshStatus === "partial" && "text-amber-600 dark:text-amber-300",
            refreshStatus === "error" && "text-rose-600 dark:text-rose-300",
            refreshStatus === "loading" && "text-slate-500 dark:text-slate-400"
          )}
        >
          {refreshMessage}
        </span>
      ) : null}
    </div>
  );
}
