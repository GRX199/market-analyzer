import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  analyzeTradeHistory,
  categorizeQueueFailure,
} from '../src/lib/trade-intelligence/analytics.ts';

function trade(id, netProfit, overrides = {}) {
  const commission = overrides.commission ?? -1;
  return {
    id,
    strategy: 'crypto_scalper',
    marketType: 'crypto',
    symbol: overrides.symbol ?? 'BTCUSDm',
    side: 'buy',
    volume: 0.01,
    entryTime: `2026-09-01T00:0${id}:00.000Z`,
    exitTime: `2026-09-01T00:1${id}:00.000Z`,
    entryPrice: 100,
    exitPrice: 101,
    initialStopLoss: 99,
    initialTakeProfit: 102,
    grossProfit: netProfit - commission,
    commission,
    swap: 0,
    fee: 0,
    netProfit,
    durationSeconds: 600,
    exitReason: 'take_profit',
    entryComment: 'robot',
    syncedAt: '2026-09-01T01:00:00.000Z',
    ...overrides,
  };
}

test('closed-trade analytics includes costs, drawdown, streaks, and expectancy', () => {
  const report = analyzeTradeHistory([
    trade('1', 9),
    trade('2', -6, { exitReason: 'stop_loss' }),
    trade('3', -4, { exitReason: 'stop_loss' }),
  ], [], '2026-09-02T00:00:00.000Z');

  assert.equal(report.metrics.netProfit, -1);
  assert.ok(Math.abs(report.metrics.expectancy - (-1 / 3)) < 1e-8);
  assert.equal(report.metrics.profitFactor, 0.9);
  assert.equal(report.metrics.maxDrawdown, 10);
  assert.equal(report.metrics.maxConsecutiveLosses, 2);
  assert.equal(report.metrics.totalCosts, 3);
  assert.equal(report.sample.quality, 'preliminary');
  assert.ok(report.insights.some((insight) => insight.id === 'negative-expectancy'));
});

test('queue failures are categorized and summarized without treating guards as losses', () => {
  assert.equal(
    categorizeQueueFailure('signal is stale or future-dated (age=682s)'),
    'stale_signal',
  );
  assert.equal(
    categorizeQueueFailure('strict M5/M15 alignment rejected buy'),
    'mtf_filter',
  );

  const incidents = Array.from({ length: 3 }, (_, index) => ({
    id: String(index),
    symbol: 'BTCUSDT',
    action: 'sell',
    status: 'failed',
    createdAt: '2026-09-01T00:00:00.000Z',
    errorMessage: 'signal is stale or future-dated',
  }));
  const report = analyzeTradeHistory([], incidents);
  assert.deepEqual(report.failures[0], {
    key: 'stale_signal',
    label: 'Sinyal kedaluwarsa',
    count: 3,
    share: 100,
  });
  assert.ok(report.insights.some((insight) => insight.id === 'stale-queue'));
});

test('weak-symbol diagnosis requires at least three closed trades', () => {
  const twoTrades = analyzeTradeHistory([
    trade('1', -2, { symbol: 'ETHUSDm' }),
    trade('2', -2, { symbol: 'ETHUSDm' }),
  ], []);
  assert.ok(!twoTrades.insights.some((insight) => insight.id.startsWith('weak-symbol-')));

  const threeTrades = analyzeTradeHistory([
    trade('1', -2, { symbol: 'ETHUSDm' }),
    trade('2', -2, { symbol: 'ETHUSDm' }),
    trade('3', -2, { symbol: 'ETHUSDm' }),
  ], []);
  assert.ok(threeTrades.insights.some((insight) => insight.id === 'weak-symbol-ETHUSDm'));
});

test('trade-intelligence ingestion stays worker-only and browser history stays owner-scoped', async () => {
  const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [ingest, report, migration, proxy] = await Promise.all([
    source('src/app/api/trade-intelligence/ingest/route.ts'),
    source('src/app/api/trade-intelligence/route.ts'),
    source('supabase/migrations/20260902000100_add_trade_intelligence.sql'),
    source('src/proxy.ts'),
  ]);

  assert.match(ingest, /authorizeWorkerRequest/);
  assert.match(ingest, /getSingleConfiguredUserId/);
  assert.doesNotMatch(ingest, /TRADING_ENABLED/);
  assert.match(ingest, /PGRST205/);
  assert.match(report, /supabase\.auth\.getUser\(\)/);
  assert.match(report, /\.eq\('user_id', userId\)/);
  assert.match(report, /PGRST205/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE/);
  assert.match(migration, /UNIQUE \(user_id, account_ref, broker_position_id\)/);
  assert.match(proxy, /api\/trade-intelligence\/ingest/);
});
