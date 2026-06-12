import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownRight, CalendarClock, Plus, Search, TrendingUp } from "lucide-react";
import { DcaPlanModal } from "@/components/DcaPlanModal";
import { HoldingForm } from "@/components/HoldingForm";
import { HoldingTable } from "@/components/HoldingTable";
import { PositionAdjustModal } from "@/components/PositionAdjustModal";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  ASSET_TYPES,
  MARKETS,
  type AssetType,
  type Holding,
  type Market
} from "@/types/holding";

export function Holdings() {
  const { holdings, upsertHolding, removeHolding } = usePortfolio();
  const [searchParams] = useSearchParams();
  const incomingQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(incomingQuery);
  const [market, setMarket] = useState<Market | "ALL">("ALL");
  const [assetType, setAssetType] = useState<AssetType | "ALL">("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [positionAction, setPositionAction] = useState<"BUY" | "SELL" | null>(null);
  const [dcaOpen, setDcaOpen] = useState(false);

  useEffect(() => {
    setQuery(incomingQuery);
  }, [incomingQuery]);

  const filteredHoldings = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return holdings.filter((holding) => {
      const matchesKeyword =
        !keyword ||
        holding.name.toLowerCase().includes(keyword) ||
        holding.symbol.toLowerCase().includes(keyword) ||
        holding.note?.toLowerCase().includes(keyword);
      const matchesMarket = market === "ALL" || holding.market === market;
      const matchesAssetType = assetType === "ALL" || holding.assetType === assetType;
      return matchesKeyword && matchesMarket && matchesAssetType;
    });
  }, [assetType, holdings, market, query]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (holding: Holding) => {
    setEditing(holding);
    setFormOpen(true);
  };

  const confirmDelete = (holding: Holding) => {
    if (window.confirm(`确定删除 ${holding.name}？`)) {
      void removeHolding(holding.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">持仓管理</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filteredHoldings.length} / {holdings.length} 项
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary" type="button" onClick={() => setDcaOpen(true)}>
            <CalendarClock className="h-4 w-4" />
            定投
          </button>
          <button className="btn-secondary" type="button" onClick={() => setPositionAction("BUY")}>
            <TrendingUp className="h-4 w-4" />
            加仓
          </button>
          <button className="btn-secondary" type="button" onClick={() => setPositionAction("SELL")}>
            <ArrowDownRight className="h-4 w-4" />
            减仓
          </button>
          <button className="btn-primary" type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增持仓
          </button>
        </div>
      </div>

      <section className="surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、代码、备注"
            />
          </label>
          <select className="input" value={market} onChange={(event) => setMarket(event.target.value as Market | "ALL")}>
            <option value="ALL">全部市场</option>
            {MARKETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={assetType}
            onChange={(event) => setAssetType(event.target.value as AssetType | "ALL")}
          >
            <option value="ALL">全部类型</option>
            {ASSET_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <HoldingTable holdings={filteredHoldings} onEdit={openEdit} onDelete={confirmDelete} />
      <HoldingForm
        open={formOpen}
        holding={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={upsertHolding}
      />
      <DcaPlanModal open={dcaOpen} onClose={() => setDcaOpen(false)} />
      {positionAction ? (
        <PositionAdjustModal
          open={Boolean(positionAction)}
          type={positionAction}
          onClose={() => setPositionAction(null)}
        />
      ) : null}
    </div>
  );
}
