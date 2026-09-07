import type { OHLCV } from '../../types/market.ts';

// Match the robot's simple mean of the last 14 true ranges. The general
// analysis module uses Wilder ATR and would give different SL/TP distances.
export function calculateForexATR(candles: OHLCV[], period = 14): number {
  if (candles.length < period + 1 || period < 1) return Number.NaN;
  let total = 0;
  for (let index = candles.length - period; index < candles.length; index++) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    total += Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  }
  return total / period;
}

export function calculateForexRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1 || period < 1) return Number.NaN;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index++) {
    const change = closes[index] - closes[index - 1];
    gain += Math.max(change, 0) / period;
    loss += Math.max(-change, 0) / period;
  }
  for (let index = period + 1; index < closes.length; index++) {
    const change = closes[index] - closes[index - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return gain > 0 ? 100 : 50;
  return 100 - 100 / (1 + gain / loss);
}
