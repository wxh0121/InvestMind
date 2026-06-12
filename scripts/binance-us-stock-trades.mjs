#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECV_WINDOW = 10_000;
const DEFAULT_BASE_URL = "https://api.binance.com";
const DEFAULT_OUTPUT = "reports/binance-us-stock-holdings.json";
const QUOTE_ASSET_FALLBACKS = ["FDUSD", "USDT", "USDC", "BUSD", "TUSD", "USD"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return null;
  const index = trimmed.indexOf("=");
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
};

const loadLocalEnv = async () => {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = await readFile(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        const [key, value] = parsed;
        process.env[key] ??= value;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
};

const parseSymbols = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

const parseTime = (value, label) => {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} 不是有效时间：${value}`);
  }
  return timestamp;
};

const toIso = (timestamp) => (timestamp ? new Date(timestamp).toISOString() : undefined);

const round = (value, digits = 8) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;

const money = (value) => round(value, 8);

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toQueryString = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  return search.toString();
};

const sign = (queryString, secret) =>
  crypto.createHmac("sha256", secret).update(queryString).digest("hex");

class BinanceClient {
  constructor({ apiKey, apiSecret, baseUrl, recvWindow }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.recvWindow = recvWindow;
  }

  async publicGet(endpoint, params = {}) {
    const queryString = toQueryString(params);
    const url = `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "InvestMind Binance importer"
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Binance public ${endpoint} failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  async signedGet(endpoint, params = {}) {
    const signedParams = {
      ...params,
      recvWindow: this.recvWindow,
      timestamp: Date.now()
    };
    const queryString = toQueryString(signedParams);
    const signature = sign(queryString, this.apiSecret);
    const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;
    const response = await fetch(url, {
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "User-Agent": "InvestMind Binance importer"
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Binance signed ${endpoint} failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
  }
}

const inferAssetsFromSymbol = (symbol) => {
  const quoteAsset = QUOTE_ASSET_FALLBACKS.find((quote) => symbol.endsWith(quote)) ?? "USDT";
  return {
    baseAsset: symbol.slice(0, -quoteAsset.length) || symbol,
    quoteAsset
  };
};

const getExchangeInfo = async (client, warnings) => {
  try {
    const response = await client.publicGet("/api/v3/exchangeInfo");
    const records = (response.symbols ?? []).map((item) => ({
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      status: item.status
    }));

    return {
      records,
      bySymbol: new Map(records.map((item) => [item.symbol, item]))
    };
  } catch (error) {
    warnings.push(`无法读取 exchangeInfo，将按配置交易对尝试查询：${error.message}`);
    return {
      records: [],
      bySymbol: new Map()
    };
  }
};

const getSearchTerms = (configuredSymbols, searchValue) => {
  const terms = new Set(parseSymbols(searchValue));

  for (const symbol of configuredSymbols) {
    terms.add(symbol);
    const inferred = inferAssetsFromSymbol(symbol);
    if (inferred.baseAsset) terms.add(inferred.baseAsset);
  }

  return Array.from(terms);
};

const findSymbolMatches = (exchangeRecords, terms) =>
  Object.fromEntries(
    terms.map((term) => [
      term,
      exchangeRecords
        .filter(
          (item) =>
            item.symbol.includes(term) ||
            item.baseAsset.includes(term) ||
            `${item.baseAsset}${item.quoteAsset}`.includes(term)
        )
        .slice(0, 50)
    ])
  );

const fetchTradesByFromId = async (client, symbol) => {
  const allTrades = [];
  let fromId = 0;
  let guard = 0;

  while (guard < 500) {
    guard += 1;
    const trades = await client.signedGet("/api/v3/myTrades", {
      symbol,
      fromId,
      limit: 1000
    });

    if (!Array.isArray(trades) || !trades.length) break;
    allTrades.push(...trades);

    const maxId = Math.max(...trades.map((trade) => Number(trade.id)).filter(Number.isFinite));
    if (!Number.isFinite(maxId) || trades.length < 1000) break;
    fromId = maxId + 1;
    await sleep(150);
  }

  if (guard >= 500) {
    throw new Error(`${symbol} 交易分页超过安全上限，请缩小时间范围后重试`);
  }

  return allTrades;
};

const fetchTradesByTime = async (client, symbol, startTime, endTime, warnings) => {
  const allTrades = [];
  const seen = new Set();
  let cursor = startTime;

  while (cursor <= endTime) {
    const windowEnd = Math.min(cursor + DAY_MS - 1, endTime);
    const trades = await client.signedGet("/api/v3/myTrades", {
      symbol,
      startTime: cursor,
      endTime: windowEnd,
      limit: 1000
    });

    if (Array.isArray(trades)) {
      if (trades.length >= 1000) {
        warnings.push(`${symbol} 在 ${toIso(cursor)} - ${toIso(windowEnd)} 返回 1000 条，可能需要缩小时间范围避免遗漏`);
      }
      for (const trade of trades) {
        const key = `${trade.symbol}:${trade.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allTrades.push(trade);
      }
    }

    cursor = windowEnd + 1;
    await sleep(150);
  }

  return allTrades;
};

const fetchSymbolTrades = async (client, symbol, startTime, endTime, warnings) => {
  if (startTime !== undefined || endTime !== undefined) {
    const safeStart = startTime ?? 0;
    const safeEnd = endTime ?? Date.now();
    return fetchTradesByTime(client, symbol, safeStart, safeEnd, warnings);
  }
  return fetchTradesByFromId(client, symbol);
};

const getCurrentPrices = async (client, symbols, warnings) => {
  if (!symbols.length) return new Map();

  try {
    const prices = await client.publicGet("/api/v3/ticker/price", {
      symbols: JSON.stringify(symbols)
    });
    return new Map((Array.isArray(prices) ? prices : []).map((item) => [item.symbol, toNumber(item.price)]));
  } catch (error) {
    warnings.push(`无法读取当前价格：${error.message}`);
    return new Map();
  }
};

const addFee = (feesByAsset, asset, amount) => {
  if (!asset || !amount) return;
  feesByAsset[asset] = round((feesByAsset[asset] ?? 0) + amount, 12);
};

const normalizeTrade = (trade, assetInfo) => {
  const price = toNumber(trade.price);
  const quantity = toNumber(trade.qty);
  const quoteQuantity = toNumber(trade.quoteQty) || price * quantity;
  const commission = toNumber(trade.commission);
  return {
    symbol: trade.symbol,
    baseAsset: assetInfo.baseAsset,
    quoteAsset: assetInfo.quoteAsset,
    id: Number(trade.id),
    orderId: Number(trade.orderId),
    side: trade.isBuyer ? "BUY" : "SELL",
    price,
    quantity,
    quoteQuantity,
    commission,
    commissionAsset: trade.commissionAsset,
    time: Number(trade.time),
    timeIso: new Date(Number(trade.time)).toISOString(),
    isMaker: Boolean(trade.isMaker)
  };
};

const calculatePosition = (symbol, assetInfo, rawTrades, currentPrice) => {
  const trades = rawTrades
    .map((trade) => normalizeTrade(trade, assetInfo))
    .sort((first, second) => first.time - second.time || first.id - second.id);

  let quantity = 0;
  let costBasis = 0;
  let realizedPnl = 0;
  let totalBuyQuantity = 0;
  let totalBuyAmount = 0;
  let totalSellQuantity = 0;
  let totalSellAmount = 0;
  const feesByAsset = {};
  const buyHistory = [];
  const sellHistory = [];

  for (const trade of trades) {
    addFee(feesByAsset, trade.commissionAsset, trade.commission);

    if (trade.side === "BUY") {
      const netQuantity =
        trade.commissionAsset === trade.baseAsset
          ? Math.max(0, trade.quantity - trade.commission)
          : trade.quantity;
      const totalCost =
        trade.commissionAsset === trade.quoteAsset
          ? trade.quoteQuantity + trade.commission
          : trade.quoteQuantity;

      quantity += netQuantity;
      costBasis += totalCost;
      totalBuyQuantity += netQuantity;
      totalBuyAmount += totalCost;
      buyHistory.push({
        id: trade.id,
        orderId: trade.orderId,
        time: trade.timeIso,
        side: trade.side,
        price: money(trade.price),
        quantity: round(netQuantity, 12),
        amount: money(totalCost),
        commission: trade.commission,
        commissionAsset: trade.commissionAsset
      });
      continue;
    }

    const grossSellQuantity =
      trade.commissionAsset === trade.baseAsset
        ? trade.quantity + trade.commission
        : trade.quantity;
    const proceeds =
      trade.commissionAsset === trade.quoteAsset
        ? trade.quoteQuantity - trade.commission
        : trade.quoteQuantity;
    const averageCostBeforeSell = quantity > 0 ? costBasis / quantity : 0;
    const quantityRemoved = Math.min(grossSellQuantity, Math.max(quantity, 0));
    const removedCost = averageCostBeforeSell * quantityRemoved;

    quantity -= grossSellQuantity;
    costBasis -= removedCost;
    realizedPnl += proceeds - removedCost;
    totalSellQuantity += grossSellQuantity;
    totalSellAmount += proceeds;
    sellHistory.push({
      id: trade.id,
      orderId: trade.orderId,
      time: trade.timeIso,
      side: trade.side,
      price: money(trade.price),
      quantity: round(grossSellQuantity, 12),
      amount: money(proceeds),
      averageCostBeforeSell: money(averageCostBeforeSell),
      realizedPnl: money(proceeds - removedCost),
      commission: trade.commission,
      commissionAsset: trade.commissionAsset
    });

    if (Math.abs(quantity) < 1e-10) {
      quantity = 0;
      costBasis = 0;
    }
  }

  const averageCost = quantity > 0 ? costBasis / quantity : 0;
  const marketValue = currentPrice ? quantity * currentPrice : undefined;
  const unrealizedPnl = marketValue !== undefined ? marketValue - costBasis : undefined;

  return {
    symbol,
    baseAsset: assetInfo.baseAsset,
    quoteAsset: assetInfo.quoteAsset,
    tradeCount: trades.length,
    currentQuantity: round(quantity, 12),
    averageCost: money(averageCost),
    costBasis: money(costBasis),
    currentPrice: currentPrice ? money(currentPrice) : null,
    marketValue: marketValue !== undefined ? money(marketValue) : null,
    unrealizedPnl: unrealizedPnl !== undefined ? money(unrealizedPnl) : null,
    realizedPnl: money(realizedPnl),
    totalBuyQuantity: round(totalBuyQuantity, 12),
    totalBuyAmount: money(totalBuyAmount),
    totalSellQuantity: round(totalSellQuantity, 12),
    totalSellAmount: money(totalSellAmount),
    feesByAsset,
    buyHistory,
    sellHistory
  };
};

const toCsv = (positions) => {
  const headers = [
    "symbol",
    "baseAsset",
    "quoteAsset",
    "tradeCount",
    "currentQuantity",
    "averageCost",
    "costBasis",
    "currentPrice",
    "marketValue",
    "unrealizedPnl",
    "realizedPnl",
    "totalBuyQuantity",
    "totalBuyAmount",
    "totalSellQuantity",
    "totalSellAmount"
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...positions.map((position) => headers.map((header) => escape(position[header])).join(","))
  ].join("\n");
};

const main = async () => {
  await loadLocalEnv();

  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  const symbols = parseSymbols(process.env.BINANCE_STOCK_SYMBOLS);
  const searchTerms = getSearchTerms(symbols, process.env.BINANCE_SYMBOL_SEARCH);
  const baseUrl = process.env.BINANCE_BASE_URL || DEFAULT_BASE_URL;
  const output = process.env.BINANCE_OUTPUT || DEFAULT_OUTPUT;
  const recvWindow = Number(process.env.BINANCE_RECV_WINDOW || DEFAULT_RECV_WINDOW);
  const startTime = parseTime(process.env.BINANCE_START_TIME, "BINANCE_START_TIME");
  const endTime = parseTime(process.env.BINANCE_END_TIME, "BINANCE_END_TIME");

  if (!apiKey || !apiSecret) {
    throw new Error("请先在 .env.local 中配置 BINANCE_API_KEY 和 BINANCE_API_SECRET");
  }

  if (!symbols.length) {
    throw new Error("请先在 .env.local 中配置 BINANCE_STOCK_SYMBOLS，例如 TSLAUSDT,AAPLUSDT");
  }

  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new Error("BINANCE_START_TIME 不能晚于 BINANCE_END_TIME");
  }

  const warnings = [];
  const client = new BinanceClient({
    apiKey,
    apiSecret,
    baseUrl,
    recvWindow: Number.isFinite(recvWindow) ? recvWindow : DEFAULT_RECV_WINDOW
  });

  const exchangeInfo = await getExchangeInfo(client, warnings);
  const invalidSymbols = exchangeInfo.records.length
    ? symbols.filter((symbol) => !exchangeInfo.bySymbol.has(symbol))
    : [];
  const validSymbols = exchangeInfo.records.length
    ? symbols.filter((symbol) => exchangeInfo.bySymbol.has(symbol))
    : symbols;
  const symbolMatches = exchangeInfo.records.length
    ? findSymbolMatches(exchangeInfo.records, searchTerms)
    : {};

  for (const symbol of invalidSymbols) {
    warnings.push(`${symbol} 不是当前 Binance Spot API 支持的交易对，已跳过。`);
  }

  const currentPrices = await getCurrentPrices(client, validSymbols, warnings);
  const positions = [];

  for (const symbol of validSymbols) {
    const assetInfo = exchangeInfo.bySymbol.get(symbol) ?? {
      symbol,
      ...inferAssetsFromSymbol(symbol),
      status: "UNKNOWN"
    };
    const rawTrades = await fetchSymbolTrades(client, symbol, startTime, endTime, warnings);
    positions.push(calculatePosition(symbol, assetInfo, rawTrades, currentPrices.get(symbol)));
  }

  const result = {
    generatedAt: new Date().toISOString(),
    source: "Binance Spot /api/v3/myTrades",
    note: "只统计 BINANCE_STOCK_SYMBOLS 中列出的交易对；Binance 私有交易记录接口必须逐个 symbol 查询。",
    config: {
      baseUrl,
      symbols,
      validSymbols,
      invalidSymbols,
      startTime: toIso(startTime),
      endTime: toIso(endTime)
    },
    symbolMatches,
    warnings,
    positions
  };

  const outputPath = path.resolve(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const csvPath = outputPath.replace(/\.json$/i, ".summary.csv");
  await writeFile(csvPath, `${toCsv(positions)}\n`, "utf8");

  console.log(`已保存持仓明细：${outputPath}`);
  console.log(`已保存汇总 CSV：${csvPath}`);
  console.log(`统计交易对：${symbols.join(", ")}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
