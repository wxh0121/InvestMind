import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AllocationEntry } from "@/types/portfolio";
import type { Currency } from "@/types/holding";
import { formatCompactCurrency, formatPercent } from "@/utils/format";

const COLORS = ["#D97757", "#6F8F72", "#C9923A", "#B85C5C", "#8E735B", "#4B4038", "#A56A43"];

interface AllocationPieChartProps<T extends string> {
  title: string;
  data: Array<AllocationEntry<T>>;
  currency: Currency;
}

export function AllocationPieChart<T extends string>({
  title,
  data,
  currency
}: AllocationPieChartProps<T>) {
  return (
    <section className="surface surface-hover p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
      </div>
      <div className="h-72">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="72%" paddingAngle={2}>
                {data.map((entry, index) => (
                  <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, item) => [
                  `${formatCompactCurrency(value, currency)} · ${formatPercent(item.payload.percent)}`,
                  item.payload.label
                ]}
              />
              <Legend iconType="circle" />
            </PieChart>
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
