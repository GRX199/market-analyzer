import { NextResponse } from 'next/server';

import { FOREX_SYMBOLS } from '@/lib/constants';
import { calculateATR, calculateEMA, calculateRSI } from '@/lib/analysis/technical';
import { getOHLCV } from '@/services/market-data';
import type { OHLCV } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROBOT_PAIRS = ['XAU/USD', 'EUR/USD', 'USD/JPY', 'USD/CHF', 'GBP/USD'] as const;
const M15_SECONDS = 15 * 60;
const ATR_STOP_MULTIPLIER = 1.5;
const REWARD_RISK_RATIO = 1.5;

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

function completedM15Candles(candles: OHLCV[], now = Date.now()): OHLCV[] {
  const activeCandleStart = Math.floor(now / (M15_SECONDS * 1000)) * M15_SECONDS;
  return candles.filter((candle) => {
    const time = candleTimeSeconds(candle);
    return time !== null && time < activeCandleStart;
  });
}

async function analyzePair(symbol: typeof ROBOT_PAIRS[number]) {
  const name = FOREX_SYMBOLS.find((item) => item.symbol === symbol)?.name ?? symbol;
  try {
    const completedCandles = completedM15Candles(await getOHLCV(symbol, '15m'));
    if (completedCandles.length < 200) {
      return {
        symbol,
        name,
        signal: 'unavailable' as PreviewSignal,
        reason: `Riwayat candle final belum cukup (${completedCandles.length}/200).`,
      };
    }

    const closes = completedCandles.map((candle) => candle.close);
    const ema50 = calculateEMA(closes, 50).at(-1);
    const ema200 = calculateEMA(closes, 200).at(-1);
    const rsi = calculateRSI(closes, 14).at(-1);
    const atr = calculateATR(completedCandles, 14).at(-1);
    const lastCandle = completedCandles.at(-1);
    const lastClosedTime = lastCandle ? candleTimeSeconds(lastCandle) : null;

    if (
      !lastCandle
      || ema50 === undefined
      || ema200 === undefined
      || rsi === undefined
      || atr === undefined
      || !Number.isFinite(ema50)
      || !Number.isFinite(ema200)
      || !Number.isFinite(rsi)
      || !Number.isFinite(atr)
      || atr <= 0
      || lastClosedTime === null
    ) {
      return {
        symbol,
        name,
        signal: 'unavailable' as PreviewSignal,
        reason: 'Indikator M15 belum dapat dihitung dari provider website.',
      };
    }

    const trend = ema50 > ema200 ? 'bullish' : ema50 < ema200 ? 'bearish' : 'neutral';
    const signal: PreviewSignal = trend === 'bullish' && rsi < 45
      ? 'buy'
      : trend === 'bearish' && rsi > 55
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
      rsi,
      atr,
      stopLoss: signal === 'buy'
        ? lastCandle.close - stopDistance
        : signal === 'sell' ? lastCandle.close + stopDistance : null,
      takeProfit: signal === 'buy'
        ? lastCandle.close + targetDistance
        : signal === 'sell' ? lastCandle.close - targetDistance : null,
      lastClosedAt: new Date(lastClosedTime * 1000).toISOString(),
      reason: signal === 'buy'
        ? 'EMA 50 di atas EMA 200 dan RSI di bawah 45.'
        : signal === 'sell'
          ? 'EMA 50 di bawah EMA 200 dan RSI di atas 55.'
          : trend === 'bullish'
            ? 'Tren bullish, tetapi pullback RSI belum di bawah 45.'
            : trend === 'bearish'
              ? 'Tren bearish, tetapi pullback RSI belum di atas 55.'
              : 'EMA 50 dan EMA 200 belum memberi arah yang jelas.',
    };
  } catch (error) {
    console.error(`[Forex Robot Preview] ${symbol} failed:`, error);
    return {
      symbol,
      name,
      signal: 'unavailable' as PreviewSignal,
      reason: 'Data M15 gagal dimuat dari provider website.',
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
        timeframe: 'M15',
        source: 'Yahoo Finance preview',
        rows,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
