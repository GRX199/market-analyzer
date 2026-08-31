import type { KlineData } from './binance-feed';

export type TradeAction = 'buy' | 'sell';
export type EmaSignal = 'bullish' | 'bearish' | 'neutral' | 'wait';
export type MomentumDirection = TradeAction | 'wait';

export interface ClosedScalperSignal {
  action: TradeAction | null;
  emaSignal: EmaSignal;
  momentum: MomentumDirection;
  sourceCandleStart: number | null;
}

function calculateLastEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = closes
    .slice(0, period)
    .reduce((sum, close) => sum + close, 0) / period;

  for (let index = period; index < closes.length; index += 1) {
    ema = (closes[index] * multiplier) + (ema * (1 - multiplier));
  }
  return ema;
}

function candleDirection(candle: KlineData): 'up' | 'down' | 'neutral' {
  if (candle.close > candle.open) return 'up';
  if (candle.close < candle.open) return 'down';
  return 'neutral';
}

export function deriveClosedScalperSignal(
  history: KlineData[],
): ClosedScalperSignal {
  const closed = history
    .filter((candle) => candle.isFinal)
    .sort((first, second) => first.startTime - second.startTime);
  const latest = closed.at(-1);

  if (!latest) {
    return {
      action: null,
      emaSignal: 'wait',
      momentum: 'wait',
      sourceCandleStart: null,
    };
  }

  const closes = closed.map((candle) => candle.close);
  const ema5 = calculateLastEma(closes, 5);
  const ema13 = calculateLastEma(closes, 13);
  const emaSignal: EmaSignal = ema5 === null || ema13 === null
    ? 'wait'
    : ema5 > ema13
      ? 'bullish'
      : ema5 < ema13
        ? 'bearish'
        : 'neutral';

  const previous = closed.at(-2);
  let momentum: MomentumDirection = 'wait';
  if (previous) {
    const previousDirection = candleDirection(previous);
    const latestDirection = candleDirection(latest);
    if (previousDirection === 'up' && latestDirection === 'up') {
      momentum = 'buy';
    } else if (previousDirection === 'down' && latestDirection === 'down') {
      momentum = 'sell';
    }
  }

  const action = (
    (momentum === 'buy' && emaSignal === 'bullish')
    || (momentum === 'sell' && emaSignal === 'bearish')
  )
    ? momentum
    : null;

  return {
    action,
    emaSignal,
    momentum,
    sourceCandleStart: latest.startTime,
  };
}
