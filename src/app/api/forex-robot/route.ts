import { NextResponse } from 'next/server';

import { FOREX_SYMBOLS } from '@/lib/constants';
import { calculateEMA } from '@/lib/analysis/technical';
import { calculateForexATR, calculateForexRSI } from '@/lib/trading/forex-preview-indicators';
import { getOHLCV } from '@/services/market-data';
import type { OHLCV, Timeframe } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROBOT_PAIR = 'XAU/USD' as const;
const BREAKOUT_LOOKBACK = 20;
const EMA_SLOPE_LOOKBACK = 4;
const RSI_RECOVERY_LEVEL = 45;

const MODE_CONFIG = {
  stable_h1: {
    timeframe: '1H' as Timeframe,
    timeframeSeconds: 60 * 60,
    strategyFamily: 'donchian_breakout',
    atrStopMultiplier: 3,
    rewardRiskRatio: 10,
  },
  aggressive_m15: {
    timeframe: '15m' as Timeframe,
    timeframeSeconds: 15 * 60,
    strategyFamily: 'pullback_recovery',
    atrStopMultiplier: 2,
    rewardRiskRatio: 2,
  },
} as const;

type StrategyMode = keyof typeof MODE_CONFIG;
type PreviewSignal = 'buy' | 'sell' | 'wait' | 'unavailable';

function isStrategyMode(value: string | null): value is StrategyMode {
  return value === 'stable_h1' || value === 'aggressive_m15';
}

function candleTimeSeconds(candle: OHLCV): number | null {
  if (typeof candle.time === 'number') {
    return Number.isFinite(candle.time)
      ? Math.floor(candle.time > 1_000_000_000_000 ? candle.time / 1000 : candle.time)
      : null;
  }
  const timestamp = Date.parse(candle.time);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function completedCandles(candles: OHLCV[], timeframeSeconds: number, now = Date.now()): OHLCV[] {
  const activeCandleStart = Math.floor(now / (timeframeSeconds * 1000)) * timeframeSeconds;
  return candles.filter((candle) => {
    const time = candleTimeSeconds(candle);
    return time !== null && time < activeCandleStart;
  });
}

async function analyzePair(mode: StrategyMode) {
  const config = MODE_CONFIG[mode];
  const name = FOREX_SYMBOLS.find((item) => item.symbol === ROBOT_PAIR)?.name ?? ROBOT_PAIR;
  try {
    const candles = completedCandles(
      await getOHLCV(ROBOT_PAIR, config.timeframe),
      config.timeframeSeconds,
    );
    if (candles.length < 225) {
      return {
        symbol: ROBOT_PAIR,
        name,
        strategyFamily: config.strategyFamily,
        signal: 'unavailable' as PreviewSignal,
        reason: `Riwayat candle final belum cukup (${candles.length}/225).`,
      };
    }

    const closes = candles.map((candle) => candle.close);
    const ema50Series = calculateEMA(closes, 50);
    const ema50 = ema50Series.at(-1);
    const ema50Before = ema50Series.at(-1 - EMA_SLOPE_LOOKBACK);
    const ema200 = calculateEMA(closes, 200).at(-1);
    const atr = calculateForexATR(candles, 14);
    const lastCandle = candles.at(-1);
    const lastClosedTime = lastCandle ? candleTimeSeconds(lastCandle) : null;

    if (
      !lastCandle
      || ema50 === undefined
      || ema50Before === undefined
      || ema200 === undefined
      || atr === undefined
      || !Number.isFinite(ema50)
      || !Number.isFinite(ema50Before)
      || !Number.isFinite(ema200)
      || !Number.isFinite(atr)
      || atr <= 0
      || lastClosedTime === null
    ) {
      return {
        symbol: ROBOT_PAIR,
        name,
        strategyFamily: config.strategyFamily,
        signal: 'unavailable' as PreviewSignal,
        reason: `Indikator ${config.timeframe} belum dapat dihitung dari provider website.`,
      };
    }

    const trend = ema50 > ema200 ? 'bullish' : ema50 < ema200 ? 'bearish' : 'neutral';
    let signal: PreviewSignal = 'wait';
    let reason = '';
    let breakoutHigh: number | undefined;
    let breakoutLow: number | undefined;
    let rsi: number | undefined;
    let previousRsi: number | undefined;
    const emaSeparationAtr = Math.abs(ema50 - ema200) / atr;

    if (mode === 'stable_h1') {
      const priorChannel = candles.slice(-BREAKOUT_LOOKBACK - 1, -1);
      breakoutHigh = Math.max(...priorChannel.map((candle) => candle.high));
      breakoutLow = Math.min(...priorChannel.map((candle) => candle.low));
      signal = trend === 'bullish'
        && ema50 > ema50Before
        && lastCandle.close > breakoutHigh
        ? 'buy'
        : trend === 'bearish'
          && ema50 < ema50Before
          && lastCandle.close < breakoutLow
          ? 'sell'
          : 'wait';
      reason = signal === 'buy'
        ? 'Close H1 menembus high 20 candle dalam tren EMA bullish yang menguat.'
        : signal === 'sell'
          ? 'Close H1 menembus low 20 candle dalam tren EMA bearish yang melemah.'
          : trend === 'bullish'
            ? 'Tren bullish, tetapi belum ada breakout high 20 candle yang valid.'
            : trend === 'bearish'
              ? 'Tren bearish, tetapi belum ada breakout low 20 candle yang valid.'
              : 'EMA 50 dan EMA 200 belum memberi arah yang jelas.';
    } else {
      rsi = calculateForexRSI(closes, 14);
      previousRsi = calculateForexRSI(closes.slice(0, -1), 14);
      if (!Number.isFinite(rsi) || !Number.isFinite(previousRsi)) {
        throw new Error('RSI M15 tidak tersedia');
      }
      const upperLevel = 100 - RSI_RECOVERY_LEVEL;
      signal = emaSeparationAtr >= 0.5
        && trend === 'bullish'
        && ema50 > ema50Before
        && previousRsi <= RSI_RECOVERY_LEVEL
        && rsi > RSI_RECOVERY_LEVEL
        && lastCandle.close > lastCandle.open
        ? 'buy'
        : emaSeparationAtr >= 0.5
          && trend === 'bearish'
          && ema50 < ema50Before
          && previousRsi >= upperLevel
          && rsi < upperLevel
          && lastCandle.close < lastCandle.open
          ? 'sell'
          : 'wait';
      reason = signal === 'buy'
        ? 'RSI M15 pulih menembus 45 dalam tren naik yang cukup kuat.'
        : signal === 'sell'
          ? 'RSI M15 turun kembali melewati 55 dalam tren turun yang cukup kuat.'
          : emaSeparationAtr < 0.5
            ? `Jarak EMA baru ${emaSeparationAtr.toFixed(2)} ATR; minimum 0,50 ATR.`
            : 'Tren aktif, tetapi RSI belum membentuk recovery cross M15 yang lengkap.';
    }

    const stopDistance = atr * config.atrStopMultiplier;
    const targetDistance = stopDistance * config.rewardRiskRatio;
    return {
      symbol: ROBOT_PAIR,
      name,
      strategyFamily: config.strategyFamily,
      signal,
      trend,
      price: lastCandle.close,
      ema50,
      ema200,
      emaSeparationAtr,
      breakoutHigh,
      breakoutLow,
      rsi,
      previousRsi,
      atr,
      stopLoss: signal === 'buy'
        ? lastCandle.close - stopDistance
        : signal === 'sell' ? lastCandle.close + stopDistance : null,
      takeProfit: signal === 'buy'
        ? lastCandle.close + targetDistance
        : signal === 'sell' ? lastCandle.close - targetDistance : null,
      lastClosedAt: new Date(lastClosedTime * 1000).toISOString(),
      reason,
    };
  } catch (error) {
    console.error(`[Forex Robot Preview] ${ROBOT_PAIR} ${mode} failed:`, error);
    return {
      symbol: ROBOT_PAIR,
      name,
      strategyFamily: config.strategyFamily,
      signal: 'unavailable' as PreviewSignal,
      reason: `Data ${config.timeframe} gagal dimuat dari provider website.`,
    };
  }
}

export async function GET(request: Request) {
  const requestedMode = new URL(request.url).searchParams.get('mode');
  if (requestedMode !== null && !isStrategyMode(requestedMode)) {
    return NextResponse.json(
      { success: false, error: 'Mode strategi Forex tidak valid.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  }
  const strategyMode = requestedMode ?? 'stable_h1';
  const config = MODE_CONFIG[strategyMode];
  const rows = [await analyzePair(strategyMode)];
  return NextResponse.json(
    {
      success: true,
      data: {
        scannedAt: new Date().toISOString(),
        strategyMode,
        timeframe: config.timeframe,
        source: 'Yahoo Finance preview',
        rows,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
