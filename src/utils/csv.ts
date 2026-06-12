import type { Holding } from "@/types/holding";

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const holdingsToCsv = (holdings: Holding[]) => {
  const headers: Array<keyof Holding> = [
    "id",
    "name",
    "symbol",
    "market",
    "assetType",
    "currency",
    "quantity",
    "averageCost",
    "currentPrice",
    "previousClose",
    "marketValue",
    "costValue",
    "todayPnL",
    "todayPnLPercent",
    "totalPnL",
    "totalPnLPercent",
    "dataSource",
    "lastUpdated",
    "note"
  ];

  return [headers.join(","), ...holdings.map((holding) => headers.map((key) => escapeCsv(holding[key])).join(","))].join(
    "\n"
  );
};

export const downloadTextFile = (filename: string, content: string, type = "application/json") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
