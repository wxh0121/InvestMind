import type { AddAction } from "../../src/types/analysis.js";
import type { Holding } from "../../src/types/holding.js";
import type { TechnicalBias, TechnicalHoldingAnalysis, TechnicalMetrics } from "../../src/types/technical.js";
import type { HistoricalCandle } from "./types.js";
import { getOkxHistory } from "./okx.js";
import { getYahooHistory } from "./yahoo.js";

const round = (value?: number, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined;

const last = <T>(items: T[]) => items[items.length - 1];

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

const standardDeviation = (values: number[]) => {
  const mean = average(values);
  if (mean === undefined) return undefined;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

const getSmaSeries = (values: number[], period: number) =>
  values.map((_, index) => {
    if (index + 1 < period) return undefined;
    return average(values.slice(index + 1 - period, index + 1));
  });

const getEmaSeries = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1);
  const series: Array<number | undefined> = [];
  let previous: number | undefined;

  values.forEach((value, index) => {
    if (index === 0) {
      previous = value;
    } else if (previous !== undefined) {
      previous = value * multiplier + previous * (1 - multiplier);
    }
    series.push(previous);
  });

  return series;
};

const getRsiSeries = (closes: number[], period = 14) => {
  const series: Array<number | undefined> = Array(closes.length).fill(undefined);
  if (closes.length <= period) return series;

  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    avgGain += Math.max(change, 0);
    avgLoss += Math.max(-change, 0);
  }

  avgGain /= period;
  avgLoss /= period;
  series[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    series[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return series;
};

const getMacdSeries = (closes: number[]) => {
  const ema12 = getEmaSeries(closes, 12);
  const ema26 = getEmaSeries(closes, 26);
  const macd = closes.map((_, index) =>
    ema12[index] !== undefined && ema26[index] !== undefined ? ema12[index]! - ema26[index]! : undefined
  );
  const signal = getEmaSeries(macd.map((value) => value ?? 0), 9);
  const histogram = macd.map((value, index) =>
    value !== undefined && signal[index] !== undefined ? value - signal[index]! : undefined
  );

  return { ema12, ema26, macd, signal, histogram };
};

const getAtrSeries = (candles: HistoricalCandle[], period = 14) => {
  const trueRanges = candles.map((candle, index) => {
    const high = candle.high ?? candle.close;
    const low = candle.low ?? candle.close;
    const previousClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });

  return trueRanges.map((_, index) => {
    if (index + 1 < period) return undefined;
    return average(trueRanges.slice(index + 1 - period, index + 1));
  });
};

const getObvSeries = (candles: HistoricalCandle[]) => {
  const series: number[] = [];
  let obv = 0;

  candles.forEach((candle, index) => {
    const volume = candle.volume ?? 0;
    const previousClose = candles[index - 1]?.close;
    if (previousClose !== undefined) {
      if (candle.close > previousClose) obv += volume;
      if (candle.close < previousClose) obv -= volume;
    }
    series.push(obv);
  });

  return series;
};

const getKdjSeries = (candles: HistoricalCandle[], period = 9) => {
  const k: Array<number | undefined> = [];
  const d: Array<number | undefined> = [];
  const j: Array<number | undefined> = [];
  let previousK = 50;
  let previousD = 50;

  candles.forEach((candle, index) => {
    if (index + 1 < period) {
      k.push(undefined);
      d.push(undefined);
      j.push(undefined);
      return;
    }

    const window = candles.slice(index + 1 - period, index + 1);
    const highestHigh = Math.max(...window.map((item) => item.high ?? item.close));
    const lowestLow = Math.min(...window.map((item) => item.low ?? item.close));
    const rsv = highestHigh === lowestLow ? 50 : ((candle.close - lowestLow) / (highestHigh - lowestLow)) * 100;
    previousK = (2 * previousK + rsv) / 3;
    previousD = (2 * previousD + previousK) / 3;
    k.push(previousK);
    d.push(previousD);
    j.push(3 * previousK - 2 * previousD);
  });

  return { k, d, j };
};

const getAdxSeries = (candles: HistoricalCandle[], period = 14) => {
  const dx: Array<number | undefined> = Array(candles.length).fill(undefined);

  for (let index = period; index < candles.length; index += 1) {
    let trSum = 0;
    let plusDmSum = 0;
    let minusDmSum = 0;

    for (let cursor = index + 1 - period; cursor <= index; cursor += 1) {
      const current = candles[cursor];
      const previous = candles[cursor - 1] ?? current;
      const high = current.high ?? current.close;
      const low = current.low ?? current.close;
      const previousHigh = previous.high ?? previous.close;
      const previousLow = previous.low ?? previous.close;
      const previousClose = previous.close;
      const upMove = high - previousHigh;
      const downMove = previousLow - low;

      trSum += Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
      plusDmSum += upMove > downMove && upMove > 0 ? upMove : 0;
      minusDmSum += downMove > upMove && downMove > 0 ? downMove : 0;
    }

    if (trSum === 0) continue;
    const plusDi = (plusDmSum / trSum) * 100;
    const minusDi = (minusDmSum / trSum) * 100;
    const denominator = plusDi + minusDi;
    dx[index] = denominator === 0 ? 0 : (Math.abs(plusDi - minusDi) / denominator) * 100;
  }

  return dx.map((_, index) => {
    const values = dx.slice(Math.max(0, index + 1 - period), index + 1).filter((value): value is number => value !== undefined);
    return values.length >= period ? average(values) : undefined;
  });
};

const latestPair = (series: Array<number | undefined>) => {
  let currentIndex = -1;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== undefined) {
      currentIndex = index;
      break;
    }
  }

  if (currentIndex === -1) return { current: undefined, previous: undefined };
  let previousIndex = -1;
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (series[index] !== undefined) {
      previousIndex = index;
      break;
    }
  }

  return {
    current: series[currentIndex],
    previous: previousIndex === -1 ? undefined : series[previousIndex]
  };
};

const buildAction = (score: number): AddAction => {
  if (score >= 6) return "BUY_MORE";
  if (score <= -6) return "REDUCE";
  if (Math.abs(score) >= 2) return "WATCH";
  return "HOLD";
};

const buildBias = (score: number): TechnicalBias => {
  if (score >= 4) return "BULLISH";
  if (score <= -4) return "BEARISH";
  if (Math.abs(score) >= 2) return "MIXED";
  return "NEUTRAL";
};

export const analyzeCandles = (
  holding: Holding,
  candles: HistoricalCandle[],
  source: string
): TechnicalHoldingAnalysis => {
  const validCandles = candles.filter((candle) => Number.isFinite(candle.close));
  const closes = validCandles.map((candle) => candle.close);
  const close = last(closes);

  if (!close || validCandles.length < 30) {
    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      source,
      ok: false,
      action: "HOLD",
      bias: "UNAVAILABLE",
      score: 0,
      reasons: ["历史价格不足，无法计算稳定技术指标"],
      metrics: {},
      candleCount: validCandles.length,
      updatedAt: new Date().toISOString(),
      error: "not enough historical candles"
    };
  }

  const sma5 = getSmaSeries(closes, 5);
  const sma10 = getSmaSeries(closes, 10);
  const sma20 = getSmaSeries(closes, 20);
  const sma50 = getSmaSeries(closes, 50);
  const sma60 = getSmaSeries(closes, 60);
  const sma120 = getSmaSeries(closes, 120);
  const sma200 = getSmaSeries(closes, 200);
  const rsi14 = getRsiSeries(closes, 14);
  const macd = getMacdSeries(closes);
  const atr14 = getAtrSeries(validCandles, 14);
  const obv = getObvSeries(validCandles);
  const kdj = getKdjSeries(validCandles, 9);
  const adx14 = getAdxSeries(validCandles, 14);
  const ma20 = latestPair(sma20);
  const ma60 = latestPair(sma60);
  const longMa = latestPair(sma200).current ?? latestPair(sma120).current ?? ma60.current ?? latestPair(sma50).current;
  const previousLongMa = latestPair(sma200).previous ?? latestPair(sma120).previous ?? ma60.previous ?? latestPair(sma50).previous;
  const rsi = latestPair(rsi14);
  const macdLine = latestPair(macd.macd);
  const macdSignal = latestPair(macd.signal);
  const macdHistogram = latestPair(macd.histogram);
  const atr = latestPair(atr14);
  const adx = latestPair(adx14);
  const latestObv = latestPair(obv);
  const k = latestPair(kdj.k);
  const d = latestPair(kdj.d);
  const j = latestPair(kdj.j);
  const bollingerWindow = closes.slice(-20);
  const bollingerMiddle = average(bollingerWindow);
  const bollingerStd = standardDeviation(bollingerWindow);
  const bollingerUpper =
    bollingerMiddle !== undefined && bollingerStd !== undefined ? bollingerMiddle + 2 * bollingerStd : undefined;
  const bollingerLower =
    bollingerMiddle !== undefined && bollingerStd !== undefined ? bollingerMiddle - 2 * bollingerStd : undefined;
  const bollingerBandwidth =
    bollingerMiddle && bollingerUpper !== undefined && bollingerLower !== undefined
      ? ((bollingerUpper - bollingerLower) / bollingerMiddle) * 100
      : undefined;
  const reasons: string[] = [];
  let score = 0;

  if (ma20.current !== undefined) {
    if (close > ma20.current) {
      score += 2;
      reasons.push("价格站上 20 日均线，短期趋势偏强");
    } else {
      score -= 2;
      reasons.push("价格跌破 20 日均线，短期趋势转弱");
    }
  }

  if (ma20.current !== undefined && longMa !== undefined) {
    if (ma20.current > longMa) {
      score += 2;
      reasons.push("20 日均线高于长期均线，趋势过滤偏多");
    } else {
      score -= 2;
      reasons.push("20 日均线低于长期均线，趋势过滤偏空");
    }
  }

  if (
    ma20.previous !== undefined &&
    previousLongMa !== undefined &&
    ma20.current !== undefined &&
    longMa !== undefined
  ) {
    if (ma20.previous <= previousLongMa && ma20.current > longMa) {
      score += 4;
      reasons.push("短期均线上穿长期均线，形成金叉信号");
    }
    if (ma20.previous >= previousLongMa && ma20.current < longMa) {
      score -= 4;
      reasons.push("短期均线下穿长期均线，形成死叉信号");
    }
  }

  if (rsi.current !== undefined) {
    if (rsi.current < 30 && (rsi.previous === undefined || rsi.current >= rsi.previous)) {
      score += 4;
      reasons.push("RSI 处于超卖区并开始回升");
    } else if (rsi.current > 70 && (rsi.previous === undefined || rsi.current <= rsi.previous)) {
      score -= 4;
      reasons.push("RSI 处于超买区并开始回落");
    } else if (rsi.current > 70) {
      score -= 2;
      reasons.push("RSI 处于超买区，避免追高");
    }
  }

  if (
    macdLine.current !== undefined &&
    macdSignal.current !== undefined &&
    macdLine.previous !== undefined &&
    macdSignal.previous !== undefined
  ) {
    if (macdLine.previous <= macdSignal.previous && macdLine.current > macdSignal.current) {
      score += 4;
      reasons.push("MACD 线上穿信号线，动量转强");
    }
    if (macdLine.previous >= macdSignal.previous && macdLine.current < macdSignal.current) {
      score -= 4;
      reasons.push("MACD 线下穿信号线，动量转弱");
    }
  }

  if (macdHistogram.current !== undefined && macdHistogram.previous !== undefined) {
    if (macdHistogram.previous <= 0 && macdHistogram.current > 0) {
      score += 3;
      reasons.push("MACD 柱状图由负转正");
    } else if (macdHistogram.previous >= 0 && macdHistogram.current < 0) {
      score -= 3;
      reasons.push("MACD 柱状图由正转负");
    }
  }

  if (bollingerLower !== undefined && close <= bollingerLower) {
    score += 3;
    reasons.push("价格触及或跌破布林带下轨，出现超卖观察信号");
  }

  if (bollingerUpper !== undefined && close >= bollingerUpper) {
    score -= 3;
    reasons.push("价格触及或突破布林带上轨，短期过热");
  }

  if (latestObv.current !== undefined && latestObv.previous !== undefined) {
    if (latestObv.current > latestObv.previous && close >= validCandles[validCandles.length - 2].close) {
      score += 1;
      reasons.push("OBV 随价格同步走强，成交量支持趋势");
    } else if (latestObv.current < latestObv.previous && close <= validCandles[validCandles.length - 2].close) {
      score -= 1;
      reasons.push("OBV 随价格走弱，成交量确认回落");
    }
  }

  const atrPercent = atr.current !== undefined ? (atr.current / close) * 100 : undefined;
  if (atrPercent !== undefined && atrPercent > 6) {
    score -= 1;
    reasons.push("ATR 显示近期波动偏大，加仓规模应更保守");
  }

  if (adx.current !== undefined && adx.current > 25 && ma20.current !== undefined && longMa !== undefined) {
    if (ma20.current > longMa) {
      score += 2;
      reasons.push("ADX 高于 25 且趋势向上，趋势跟踪信号较强");
    } else {
      score -= 2;
      reasons.push("ADX 高于 25 且趋势向下，优先控制风险");
    }
  }

  if (!reasons.length) {
    reasons.push("技术指标暂未形成明显共振信号");
  }

  const metrics: TechnicalMetrics = {
    close: round(close),
    volume: round(last(validCandles)?.volume, 0),
    ma5: round(latestPair(sma5).current),
    ma10: round(latestPair(sma10).current),
    ma20: round(ma20.current),
    ma50: round(latestPair(sma50).current),
    ma60: round(ma60.current),
    ma120: round(latestPair(sma120).current),
    ma200: round(latestPair(sma200).current),
    ema12: round(latestPair(macd.ema12).current),
    ema26: round(latestPair(macd.ema26).current),
    rsi14: round(rsi.current),
    macd: round(macdLine.current, 4),
    macdSignal: round(macdSignal.current, 4),
    macdHistogram: round(macdHistogram.current, 4),
    bollingerMiddle: round(bollingerMiddle),
    bollingerUpper: round(bollingerUpper),
    bollingerLower: round(bollingerLower),
    bollingerBandwidth: round(bollingerBandwidth),
    obv: round(latestObv.current, 0),
    atr14: round(atr.current),
    atrPercent: round(atrPercent),
    kdjK: round(k.current),
    kdjD: round(d.current),
    kdjJ: round(j.current),
    adx14: round(adx.current)
  };

  const normalizedScore = Math.max(-12, Math.min(12, score));

  return {
    holdingId: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    source,
    ok: true,
    action: buildAction(normalizedScore),
    bias: buildBias(normalizedScore),
    score: normalizedScore,
    reasons: reasons.slice(0, 6),
    metrics,
    candleCount: validCandles.length,
    updatedAt: new Date().toISOString()
  };
};

export const analyzeHoldingTechnicals = async (holding: Holding): Promise<TechnicalHoldingAnalysis> => {
  if (holding.market === "CASH" || holding.assetType === "CASH") {
    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      source: "MANUAL",
      ok: false,
      action: "HOLD",
      bias: "UNAVAILABLE",
      score: 0,
      reasons: ["现金不计算技术指标"],
      metrics: {},
      candleCount: 0,
      updatedAt: new Date().toISOString()
    };
  }

  try {
    if (holding.dataSource === "OKX" || holding.market === "CRYPTO") {
      return analyzeCandles(holding, await getOkxHistory(holding.symbol), "OKX");
    }

    if (holding.dataSource === "YAHOO") {
      return analyzeCandles(
        holding,
        await getYahooHistory({ symbol: holding.symbol, market: holding.market }),
        "YAHOO"
      );
    }

    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      source: holding.dataSource,
      ok: false,
      action: "HOLD",
      bias: "UNAVAILABLE",
      score: 0,
      reasons: ["当前数据源暂未接入稳定历史行情，无法计算技术指标"],
      metrics: {},
      candleCount: 0,
      updatedAt: new Date().toISOString(),
      error: "historical data source is unavailable"
    };
  } catch (error) {
    return {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      source: holding.dataSource,
      ok: false,
      action: "HOLD",
      bias: "UNAVAILABLE",
      score: 0,
      reasons: ["历史行情获取失败，暂时沿用本地规则分析"],
      metrics: {},
      candleCount: 0,
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "failed to analyze technical indicators"
    };
  }
};
