import test from 'node:test';
import assert from 'node:assert/strict';

import { runBacktest } from '../src/lib/backtest/strategies.ts';

function candle(time, close, open = close, high = Math.max(open, close), low = Math.min(open, close)) {
  return { time, open, high, low, close, volume: 1_000 };
}

const crossoverData = [
  candle(1, 3),
  candle(2, 2),
  candle(3, 1),
  candle(4, 4),
  candle(5, 5, 10, 10, 5),
  candle(6, 6),
];

const noCostConfig = {
  initialCapital: 10_000,
  positionSizePct: 1,
  feePct: 0,
  slippagePct: 0,
  stopLossPct: 0,
  takeProfitPct: 0,
  periodsPerYear: 252,
};

test('executes a crossover at the next candle open, not the signal close', () => {
  const result = runBacktest(
    crossoverData,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    noCostConfig,
  );

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryTime, 5_000);
  assert.equal(result.trades[0].entryPrice, 10);
  assert.equal(result.trades[0].exitReason, 'end_of_data');
});

test('charges entry and exit fees and applies adverse slippage', () => {
  const result = runBacktest(
    crossoverData,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    {
      ...noCostConfig,
      positionSizePct: 0.5,
      feePct: 0.01,
      slippagePct: 0.01,
    },
  );
  const baseline = runBacktest(
    crossoverData,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    { ...noCostConfig, positionSizePct: 0.5 },
  );

  assert.ok(result.totalFees > 0);
  assert.ok(result.trades[0].entryPrice > crossoverData[4].open);
  assert.ok(result.trades[0].exitPrice < crossoverData[5].close);
  assert.ok(result.finalCapital < baseline.finalCapital);
});

test('uses the stop loss when stop and take-profit are both touched in one candle', () => {
  const volatileData = [
    ...crossoverData.slice(0, 4),
    candle(5, 10, 10, 12, 8),
    candle(6, 10),
  ];
  const result = runBacktest(
    volatileData,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    {
      ...noCostConfig,
      stopLossPct: 0.1,
      takeProfitPct: 0.1,
    },
  );

  assert.equal(result.trades[0].exitReason, 'stop_loss');
  assert.equal(result.trades[0].exitPrice, 9);
  assert.ok((result.trades[0].pnl ?? 0) < 0);
});

test('supports MACD and rejects invalid risk configuration', () => {
  const trendData = Array.from({ length: 80 }, (_, index) => (
    candle(index + 1, 100 + Math.sin(index / 3) * 5 + index / 10)
  ));
  const result = runBacktest(trendData, 'macd_crossover', {}, noCostConfig);

  assert.ok(Array.isArray(result.trades));
  assert.throws(
    () => runBacktest(trendData, 'rsi', {}, { ...noCostConfig, positionSizePct: 1.1 }),
    /at most 100%/,
  );
});

test('rejects a raw history whose valid candles cannot satisfy strategy warm-up', () => {
  const invalidCandles = Array.from({ length: 57 }, (_, index) => ({
    time: index + 4,
    open: Number.NaN,
    high: Number.NaN,
    low: Number.NaN,
    close: Number.NaN,
    volume: 0,
  }));
  const mostlyInvalid = [
    candle(1, 100),
    candle(2, 101),
    candle(3, 102),
    ...invalidCandles,
  ];

  assert.throws(
    () => runBacktest(
      mostlyInvalid,
      'sma_crossover',
      { smaFast: 20, smaSlow: 50 },
      noCostConfig,
    ),
    /At least 52 valid historical candles.*3 remained.*57 invalid candles/,
  );
});

test('max drawdown includes the conservative intrabar adverse excursion', () => {
  const intrabarCrash = [
    ...crossoverData.slice(0, 4),
    candle(5, 10, 10, 10, 1),
    candle(6, 10),
  ];
  const result = runBacktest(
    intrabarCrash,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    noCostConfig,
  );

  assert.equal(result.finalCapital, noCostConfig.initialCapital);
  assert.equal(result.maxDrawdown, 0.9);
  assert.equal(result.equityCurve[4].drawdown, 0.9);
});

test('take-profit on the exit candle cannot erase its adverse OHLC excursion', () => {
  const takeProfitWithAdverseLow = [
    ...crossoverData.slice(0, 4),
    candle(5, 10, 10, 11, 8.5),
    candle(6, 11),
  ];
  const result = runBacktest(
    takeProfitWithAdverseLow,
    'sma_crossover',
    { smaFast: 2, smaSlow: 3 },
    {
      ...noCostConfig,
      takeProfitPct: 0.1,
    },
  );

  assert.equal(result.trades[0].exitReason, 'take_profit');
  assert.equal(result.finalCapital, 11_000);
  assert.ok(Math.abs(result.maxDrawdown - (2_500 / 11_000)) < 1e-12);
  assert.equal(result.equityCurve[4].drawdown, result.maxDrawdown);
});
