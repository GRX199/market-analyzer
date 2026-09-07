import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { evaluateStrategyEvidence } from '../src/lib/trade-intelligence/strategy-evidence.ts';

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

const ACCOUNT_A = 'a'.repeat(24);
const ACCOUNT_B = 'b'.repeat(24);
// These synthetic histories intentionally span years to exercise pagination.
// Evaluate against an explicit clock, not the day the test suite happens to run.
const FIXTURE_AS_OF = Date.UTC(2045, 0, 1);
function evidenceAtFixture(trades, accountRef, incomplete = false) {
  return evaluateStrategyEvidence(trades, accountRef, incomplete, FIXTURE_AS_OF);
}
function currentTrade(index, netProfit = index % 3 ? 3 : -1, overrides = {}) {
  const entry = Date.UTC(2026, 8, 5) + index * 2 * 86_400_000;
  return trade(String(index), netProfit, {
    accountRef: ACCOUNT_A, strategy: 'crypto_broker_h1', symbol: 'BTCUSDm',
    entryComment: 'ctpull1:abc', entryTime: new Date(entry).toISOString(),
    exitTime: new Date(entry + 3600_000).toISOString(), ...overrides,
  });
}

test('profile evidence excludes other accounts, legacy markers, wrong symbols and pre-profile entries', () => {
  const rows = [currentTrade(1), currentTrade(2, 3, { accountRef: ACCOUNT_B }),
    currentTrade(3, 3, { entryComment: 'crypto8:old' }),
    currentTrade(4, 3, { symbol: 'ETHUSDm' }),
    currentTrade(5, 3, { entryTime: '2025-01-01T00:00:00Z' }),
    currentTrade(6, 3, { strategy: 'forex_stable_h1', marketType: 'forex', symbol: 'USDCHFm', entryComment: 'fxpull:old' })];
  const report = evidenceAtFixture(rows, ACCOUNT_A);
  assert.equal(report[0].trades, 1);
  assert.equal(report[2].trades, 0);
  assert.ok(report.every(row => row.realMoneyUnlocked === false));
  assert.equal(evidenceAtFixture(rows, null)[0].trades, 0);
});

test('review requires BOTH 60 trades and 84 observed days, never unlocks real trading', () => {
  const rows = Array.from({ length: 60 }, (_, i) => currentTrade(i));
  const ready = evidenceAtFixture(rows, ACCOUNT_A)[0];
  assert.equal(ready.status, 'review_candidate');
  assert.equal(ready.operationalEvidence, 'unverified');
  assert.equal(ready.realMoneyUnlocked, false);
  assert.equal(evidenceAtFixture(rows.slice(0, 59), ACCOUNT_A)[0].status, 'collecting');
  const clustered = rows.map(t => ({ ...t, entryTime: '2026-09-05T00:00:00Z', exitTime: '2026-09-05T01:00:00Z' }));
  assert.equal(evidenceAtFixture(clustered, ACCOUNT_A)[0].observedDays, 0);
  assert.equal(evidenceAtFixture(clustered, ACCOUNT_A)[0].status, 'collecting');
  assert.equal(evidenceAtFixture(rows, ACCOUNT_A, true)[0].status, 'review');
});

test('profile matching accepts uppercase broker history without accepting different suffixes', () => {
  const rows = [currentTrade(1, 2, { symbol: 'BTCUSDM' }),
    currentTrade(2, 2, { symbol: 'BTCUSDC' }),
    currentTrade(3, 2, { strategy: 'forex_stable_h1', marketType: 'forex', symbol: 'EURJPYM', entryComment: 'fxpull:abc' }),
    currentTrade(4, 2, { strategy: 'forex_stable_h1', marketType: 'forex', symbol: 'XAUUSDM', entryComment: 'fxbreak:abc' }),
    currentTrade(5, 2, { strategy: 'forex_aggressive_m15', marketType: 'forex', symbol: 'XAUUSDM', entryComment: 'fxm15:abc' })];
  assert.deepEqual(evidenceAtFixture(rows, ACCOUNT_A).map(row => row.trades), [1, 1, 1, 1]);
});

test('no losses, missing protection, and deterioration cannot become a review pass', () => {
  const allWins = Array.from({ length: 60 }, (_, i) => currentTrade(i, 2));
  assert.equal(evidenceAtFixture(allWins, ACCOUNT_A)[0].profitFactor, null);
  assert.equal(evidenceAtFixture(allWins, ACCOUNT_A)[0].status, 'collecting');
  const missing = [...allWins, currentTrade(61, -1, { initialTakeProfit: null })];
  assert.equal(evidenceAtFixture(missing, ACCOUNT_A)[0].status, 'review');
  const deteriorating = Array.from({ length: 60 }, (_, i) => currentTrade(i, i < 40 ? 3 : -1));
  const row = evidenceAtFixture(deteriorating, ACCOUNT_A)[0];
  assert.ok(row.expectancy > 0);
  assert.ok(row.recentExpectancy < 0);
  assert.equal(row.status, 'review');
});

function dbRow(trade, userId = 'owner') {
  return { id: trade.id, user_id: userId, account_ref: trade.accountRef,
    strategy: trade.strategy, market_type: trade.marketType, symbol: trade.symbol, side: trade.side,
    volume: trade.volume, entry_time: trade.entryTime, exit_time: trade.exitTime,
    entry_price: trade.entryPrice, exit_price: trade.exitPrice, initial_stop_loss: trade.initialStopLoss,
    initial_take_profit: trade.initialTakeProfit, gross_profit: trade.grossProfit,
    commission: trade.commission, swap: trade.swap, fee: trade.fee, net_profit: trade.netProfit,
    duration_seconds: trade.durationSeconds, exit_reason: trade.exitReason,
    entry_comment: trade.entryComment, synced_at: trade.syncedAt };
}

async function reportHandler(rows, { authenticated = true, incidentError = false, asOf = FIXTURE_AS_OF } = {}) {
  const queries = [];
  const clock = { reads: 0 };
  class EvaluationDate extends Date {
    static now() { clock.reads += 1; return asOf; }
  }
  const admin = { from(table) {
    const query = { table, filters: [], ordering: [], maximum: null, fields: null };
    queries.push(query);
    const chain = {
      select(fields) { query.fields = fields; return chain; },
      eq(field, value) { query.filters.push([field, value]); return chain; },
      gte(field, value) { query.start = [field, value]; return chain; },
      order(field, options) { query.ordering.push([field, options.ascending]); return chain; },
      limit(maximum) { query.maximum = maximum; return chain; },
      then(resolve) {
        let data = table === 'auto_trades' ? [] : rows.filter(row => query.filters.every(([field, value]) => row[field] === value));
        if (query.start) data = data.filter(row => row[query.start[0]] >= query.start[1]);
        data = [...data].sort((a, b) => {
          for (const [field, ascending] of query.ordering) {
            const order = String(a[field]).localeCompare(String(b[field]));
            if (order) return ascending ? order : -order;
          }
          return 0;
        });
        return Promise.resolve({ data: data.slice(0, query.maximum), count: data.length,
          error: table === 'auto_trades' && incidentError ? { code: 'timeout' } : null }).then(resolve);
      },
    };
    return chain;
  } };
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'owner' } : null } }) } }),
      getSupabaseAdminClient: () => admin,
    },
    '@/lib/trade-intelligence/analytics': { analyzeTradeHistory },
    '@/lib/trade-intelligence/strategy-evidence': { evaluateStrategyEvidence },
  };
  const source = await readFile(new URL('../src/app/api/trade-intelligence/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Date: EvaluationDate, console, require: name => { assert.ok(name in modules); return modules[name]; } });
  return { GET: exports.GET, queries, clock };
}

test('standalone evidence rejects and flags future rows with the default evaluation clock', (context) => {
  const asOf = Date.UTC(2026, 8, 7);
  const clock = context.mock.method(Date, 'now', () => asOf);
  const rows = Array.from({ length: 60 }, (_, i) => currentTrade(i));
  const result = evaluateStrategyEvidence(rows, ACCOUNT_A)[0];
  assert.equal(clock.mock.callCount(), 1);
  assert.equal(result.status, 'review');
  assert.equal(result.trades, 1);
  assert.equal(result.observedDays, 0);
  assert.ok(result.reasons.some(reason => reason.includes('masa depan')));
  assert.equal(result.realMoneyUnlocked, false);
});

test('invalid or future evidence cannot pass even when 60 valid trades remain', () => {
  const rows = Array.from({ length: 60 }, (_, i) => currentTrade(i));
  for (const overrides of [
    { entryTime: 'invalid' }, { exitTime: 'invalid' },
    { exitTime: '2026-09-01T00:00:00Z' },
    { exitTime: new Date(FIXTURE_AS_OF + 1).toISOString() },
  ]) {
    const result = evidenceAtFixture([...rows, currentTrade(61, 10_000, overrides)], ACCOUNT_A)[0];
    assert.equal(result.trades, 60);
    assert.equal(result.status, 'review');
    assert.ok(result.reasons.some(reason => reason.includes('dikeluarkan')));
    assert.equal(result.netProfit, evidenceAtFixture(rows, ACCOUNT_A)[0].netProfit);
  }
  for (const asOf of [NaN, Infinity, 1e20]) {
    const result = evaluateStrategyEvidence(rows, ACCOUNT_A, false, asOf)[0];
    assert.equal(result.trades, 0);
    assert.equal(result.status, 'review');
  }
});

test('closed-trade cutoff includes the exact evaluation instant, not one millisecond later', () => {
  const row = currentTrade(1);
  const cutoff = Date.parse(row.exitTime);
  assert.equal(evaluateStrategyEvidence([row], ACCOUNT_A, false, cutoff)[0].trades, 1);
  const result = evaluateStrategyEvidence([row], ACCOUNT_A, false, cutoff - 1)[0];
  assert.equal(result.trades, 0);
  assert.equal(result.status, 'review');
});

test('API excludes and flags future or invalid dates using one request clock', async () => {
  const asOf = Date.UTC(2027, 0, 2);
  const rows = Array.from({ length: 60 }, (_, i) => dbRow(currentTrade(i)));
  rows.push(dbRow(currentTrade(61, 10_000, { exitTime: 'invalid' })));
  rows.push(dbRow(currentTrade(62, 10_000)));
  const { GET, clock } = await reportHandler(rows, { asOf });
  const payload = await (await GET(new Request(`http://test/api/trade-intelligence?range=all&account=${ACCOUNT_A}`))).json();
  assert.equal(clock.reads, 1);
  assert.equal(payload.report.generatedAt, new Date(asOf).toISOString());
  assert.equal(payload.scope.invalidRows, 2);
  assert.equal(payload.report.sample.closedTrades, 60);
  assert.equal(payload.evidence[0].status, 'review');
  assert.ok(payload.evidence[0].reasons.some(reason => reason.includes('tidak valid')));
  assert.ok(payload.trades.every(row => Date.parse(row.exitTime) <= asOf));
});

test('API time range and evidence use the same captured evaluation instant', async () => {
  const asOf = Date.UTC(2026, 8, 7);
  const { GET, queries, clock } = await reportHandler([dbRow(currentTrade(0)), dbRow(currentTrade(1))], { asOf });
  const payload = await (await GET(new Request(`http://test/api/trade-intelligence?range=30&account=${ACCOUNT_A}`))).json();
  assert.equal(clock.reads, 1);
  assert.equal(payload.report.generatedAt, new Date(asOf).toISOString());
  assert.ok(queries.filter(query => query.start).every(query => query.start[1] === new Date(asOf - 30 * 86_400_000).toISOString()));
  assert.equal(payload.report.sample.closedTrades, 1);
  assert.equal(payload.scope.invalidRows, 1);
  assert.equal(payload.evidence[0].status, 'review');
});

test('report is owner/account scoped, includes newest records and declares truncation', async () => {
  const rows = Array.from({ length: 1002 }, (_, i) => dbRow(currentTrade(i)));
  rows.push(dbRow(currentTrade(2000, 9999, { accountRef: ACCOUNT_B })));
  rows.push(dbRow(currentTrade(3000, 9999), 'another-owner'));
  const { GET, queries } = await reportHandler(rows);
  const response = await GET(new Request(`http://test/api/trade-intelligence?range=all&account=${ACCOUNT_A}`));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.scope.accountRef, ACCOUNT_A);
  assert.equal(payload.scope.totalMatched, 1002);
  assert.equal(payload.scope.truncated, true);
  assert.equal(payload.report.sample.closedTrades, 1000);
  assert.equal(payload.trades[0].id, '1001');
  assert.ok(payload.trades.every(t => t.accountRef === ACCOUNT_A));
  assert.equal(payload.scope.unit, 'account_currency_unknown');
  assert.equal(payload.evidence[0].status, 'review');
  assert.ok(queries.every(q => q.filters.some(([key, value]) => key === 'user_id' && value === 'owner')));
});

test('invalid filters and unauthorized users cannot query account data', async () => {
  const valid = await reportHandler([]);
  assert.equal((await valid.GET(new Request('http://test/api/trade-intelligence?account=wrong'))).status, 400);
  assert.equal(valid.queries.length, 0);
  const unauthorized = await reportHandler([], { authenticated: false });
  assert.equal((await unauthorized.GET(new Request('http://test/api/trade-intelligence'))).status, 401);
  assert.equal(unauthorized.queries.length, 0);
});

test('latest account is selected without mixing and queue outage preserves performance', async () => {
  const rows = [dbRow(currentTrade(1)), dbRow(currentTrade(2, -1, { accountRef: ACCOUNT_B }))];
  const { GET } = await reportHandler(rows, { incidentError: true });
  const payload = await (await GET(new Request('http://test/api/trade-intelligence?range=all'))).json();
  assert.equal(payload.scope.accountRef, ACCOUNT_B);
  assert.equal(payload.report.metrics.netProfit, -1);
  assert.equal(payload.scope.queueDiagnosticsAvailable, false);
});

test('UI fences stale account requests and does not equate M1 feed with MT5 status', async () => {
  const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const page = await source('src/app/trade-intelligence/page.tsx');
  assert.match(page, /requestRef\.current\?\.abort\(\)/);
  assert.match(page, /requestRef\.current !== controller/);
  assert.match(page, /payload\.scope\.accountRef !== accountRef/);
  const notice = await source('src/components/trading/broker-runtime-notice.tsx');
  assert.match(notice, /Status proses MT5 belum tersedia/);
  assert.match(notice, /Tidak memakai sinyal atau input lot M1/);
  assert.match(await source('src/app/scalping/page.tsx'), /M1 LEGACY LOCKED/);
  assert.doesNotMatch(await source('src/app/forex-robot/page.tsx'), /Entry Crypto baru tetap ditahan/);
});
