import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Currency } from "@/types/holding";
import { formatCompactCurrency } from "@/utils/format";

interface PnLBarChartProps {
  title: string;
  data: Array<{ name: string; todayPnL: number; totalPnL: number }>;
  currency: Currency;
}

export function PnLBarChart({ title, data, currency }: PnLBarChartProps) {
  return (
    <section className="surface surface-hover p-4">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
      <div className="h-72">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DED4C7" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => formatCompactCurrency(Number(value), currency)} />
              <Tooltip formatter={(value: number) => formatCompactCurrency(value, currency)} />
              <Bar dataKey="todayPnL" name="今日盈亏" fill="#D97757" radius={[6, 6, 0, 0]} />
              <Bar dataKey="totalPnL" name="总浮动盈亏" fill="#6F8F72" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            暂无数据
          </div>
        )}
      </div>
    </section>
  );
}
