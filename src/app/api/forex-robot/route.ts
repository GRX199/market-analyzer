import { NextResponse } from 'next/server';

import { FOREX_SYMBOLS } from '@/lib/constants';
import { calculateATR, calculateEMA } from '@/lib/analysis/technical';
import { getOHLCV } from '@/services/market-data';
import type { OHLCV } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROBOT_PAIRS = ['XAU/USD'] as const;
const H1_SECONDS = 60 * 60;
const ATR_STOP_MULTIPLIER = 3;
const REWARD_RISK_RATIO = 10;
const BREAKOUT_LOOKBACK = 20;
const EMA_SLOPE_LOOKBACK = 4;

type PreviewSignal = 'buy' | 'sell' | 'wait' | 'unavailable';

function candleTimeSeconds(candle: OHLCV): number | null {
  if (typeof candle.time === 'number') {
    return Number.isFinite(candle.time)
      ? Math.floor(candle.time > 1_000_000_000_000 ? candle.time / 1000 : candle.time)
      : null;
  }
  const timestamp = Date.parse(candle.time);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function completedH1Candles(candles: OHLCV[], now = Date.now()): OHLCV[] {
  const activeCandleStart = Math.floor(now / (H1_SECONDS * 1000)) * H1_SECONDS;
  return candles.filter((candle) => {
    const time = candleTimeSeconds(candle);
    return time !== null && time < activeCandleStart;
  });
}

async function analyzePair(symbol: typeof ROBOT_PAIRS[number]) {
  const name = FOREX_SYMBOLS.find((item) => item.symbol === symbol)?.name ?? symbol;
  try {
    const completedCandles = completedH1Candles(await getOHLCV(symbol, '1H'));
    if (completedCandles.length < 225) {
      return {
        symbol,
        name,
        signal: 'unavailable' as PreviewSignal,
        reason: `Riwayat candle final belum cukup (${completedCandles.length}/225).`,
      };
    }

    const closes = completedCandles.map((candle) => candle.close);
    const ema50Series = calculateEMA(closes, 50);
    const ema50 = ema50Series.at(-1);
    const ema50Before = ema50Series.at(-1 - EMA_SLOPE_LOOKBACK);
    const ema200 = calculateEMA(closes, 200).at(-1);
    const atr = calculateATR(completedCandles, 14).at(-1);
    const lastCandle = completedCandles.at(-1);
    const priorChannel = completedCandles.slice(-BREAKOUT_LOOKBACK - 1, -1);
    const breakoutHigh = Math.max(...priorChannel.map((candle) => candle.high));
    const breakoutLow = Math.min(...priorChannel.map((candle) => candle.low));
    const lastClosedTime = lastCandle ? candleTimeSeconds(lastCandle) : null;

    if (
      !lastCandle
      || ema50 === undefined
      || ema50Before === undefined
      || ema200 === undefined
      || atr === undefined
      || !Number.isFinite(ema50)
      || !Number.isFinite(ema200)
      || !Number.isFinite(breakoutHigh)
      || !Number.isFinite(breakoutLow)
      || !Number.isFinite(atr)
      || atr <= 0
      || lastClosedTime === null
    ) {
      return {
        symbol,
        name,
        signal: 'unavailable' as PreviewSignal,
        reason: 'Indikator H1 belum dapat dihitung dari provider website.',
      };
    }

    const trend = ema50 > ema200 ? 'bullish' : ema50 < ema200 ? 'bearish' : 'neutral';
    const signal: PreviewSignal = trend === 'bullish'
      && ema50 > ema50Before
      && lastCandle.close > breakoutHigh
      ? 'buy'
      : trend === 'bearish'
        && ema50 < ema50Before
        && lastCandle.close < breakoutLow
        ? 'sell'
        : 'wait';
    const stopDistance = atr * ATR_STOP_MULTIPLIER;
    const targetDistance = stopDistance * REWARD_RISK_RATIO;

    return {
      symbol,
      name,
      signal,
      trend,
      price: lastCandle.close,
      ema50,
      ema200,
      breakoutHigh,
      breakoutLow,
      atr,
      stopLoss: signal === 'buy'
        ? lastCandle.close - stopDistance
        : signal === 'sell' ? lastCandle.close + stopDistance : null,
      takeProfit: signal === 'buy'
        ? lastCandle.close + targetDistance
        : signal === 'sell' ? lastCandle.close - targetDistance : null,
      lastClosedAt: new Date(lastClosedTime * 1000).toISOString(),
      reason: signal === 'buy'
        ? 'Close H1 menembus high 20 candle dalam tren EMA bullish yang menguat.'
        : signal === 'sell'
          ? 'Close H1 menembus low 20 candle dalam tren EMA bearish yang melemah.'
          : trend === 'bullish'
            ? 'Tren bullish, tetapi belum ada breakout high 20 candle yang valid.'
            : trend === 'bearish'
              ? 'Tren bearish, tetapi belum ada breakout low 20 candle yang valid.'
              : 'EMA 50 dan EMA 200 belum memberi arah yang jelas.',
    };
  } catch (error) {
    console.error(`[Forex Robot Preview] ${symbol} failed:`, error);
    return {
      symbol,
      name,
      signal: 'unavailable' as PreviewSignal,
      reason: 'Data H1 gagal dimuat dari provider website.',
    };
  }
}

export async function GET() {
  const rows = await Promise.all(ROBOT_PAIRS.map(analyzePair));
  return NextResponse.json(
    {
      success: true,
      data: {
        scannedAt: new Date().toISOString(),
        timeframe: 'H1',
        source: 'Yahoo Finance preview',
        rows,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
