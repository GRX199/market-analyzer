import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceSignalClock, assessBrokerPlan, effectiveSignalStatus, formatSignalPrice, signalDisplayTime } from '../src/lib/analysis/signal-presentation.ts';

const now = Date.parse('2026-09-09T04:00:00Z');
const iso = time => new Date(time).toISOString();
const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const receipt = { receivedAt: 10_000, receivedMonotonicAt: 20_000, requestDurationMs: 4_000 };
test('manual price display retains JPY points and small crypto precision', () => {
  assert.equal(formatSignalPrice(154.123), '154,123');
  assert.equal(formatSignalPrice(154.124), '154,124');
  assert.equal(formatSignalPrice(.00001234), '0,00001234');
  assert.equal(formatSignalPrice(.001), '0,001');
  assert.equal(formatSignalPrice(NaN), '—');
});
function candidate(side = 'buy') {
  return { status: 'candidate', expiresAt: iso(now + 120_000),
    source: { kind: 'broker', isProxy: false, provider: 'MT5 Broker', instrument: 'BTCUSDm',
      bid: side === 'buy' ? 100 : 99, ask: side === 'buy' ? 101 : 100,
      quoteTime: iso(now - 10_000), capturedAt: iso(now - 5_000), validUntil: iso(now + 170_000) },
    plan: { side, entry: 100, stopLoss: side === 'buy' ? 90 : 110, takeProfit: side === 'buy' ? 120 : 80, grossRiskReward: 2 },
  };
}

test('display clock accounts for response latency without depending on local timezone or clock offset', () => {
  assert.equal(signalDisplayTime(iso(now), receipt, 10_000, 20_000), now + 4_000);
  assert.equal(signalDisplayTime(iso(now), receipt, 40_000, 50_000), now + 34_000);
  // Wall clock moved backwards, monotonic elapsed still expires the same data.
  assert.equal(signalDisplayTime(iso(now), receipt, 0, 50_000), now + 34_000);
  // Sleep can stop the monotonic clock on some hosts; the wall-clock advance counts.
  assert.equal(signalDisplayTime(iso(now), receipt, 100_000, 20_000), now + 94_000);
  assert.equal(signalDisplayTime(iso(now), { ...receipt, requestDurationMs: 45_000 }, 10_000, 20_000), now + 45_000);
});

test('missing expiry and invalid clock fail closed, including the exact deadline', () => {
  assert.equal(effectiveSignalStatus(candidate(), now + 119_999), 'candidate');
  assert.equal(effectiveSignalStatus(candidate(), now + 120_000), 'stale');
  for (const expiry of [null, undefined, 'invalid']) assert.equal(effectiveSignalStatus({ status: 'candidate', expiresAt: expiry }, now), 'stale');
  for (const time of [Infinity, NaN]) assert.equal(effectiveSignalStatus(candidate(), time), 'stale');
  assert.equal(effectiveSignalStatus({ status: 'unavailable', expiresAt: null }, now), 'unavailable');
  for (const [generated, timing, wall, monotonic] of [
    ['bad', receipt, 10_000, 20_000], [iso(now), { ...receipt, requestDurationMs: -1 }, 10_000, 20_000],
    [iso(now), receipt, 10_000, 19_999], [iso(now), receipt, NaN, 20_000],
  ]) assert.equal(signalDisplayTime(generated, timing, wall, monotonic), Infinity);
});

test('forward then backward clock changes cannot resurrect an expired response', () => {
  let clock = { wall: receipt.receivedAt, monotonic: receipt.receivedMonotonicAt };
  clock = advanceSignalClock(clock, 200_000, 21_000);
  assert.equal(effectiveSignalStatus(candidate(), signalDisplayTime(iso(now), receipt, clock.wall, clock.monotonic)), 'stale');
  clock = advanceSignalClock(clock, 10_000, 22_000);
  assert.equal(effectiveSignalStatus(candidate(), signalDisplayTime(iso(now), receipt, clock.wall, clock.monotonic)), 'stale');
});

test('CFD bid/ask changes RR in both directions and never rewrites the reference levels', () => {
  for (const side of ['buy', 'sell']) {
    const row = candidate(side), before = structuredClone(row);
    const result = assessBrokerPlan(row, now);
    assert.equal(result.status, 'review', 'review is not ready-to-trade');
    assert.equal(result.quoteEntry, side === 'buy' ? 101 : 99);
    closeTo(result.riskReward, 19 / 11); closeTo(result.entryDriftR, .1); closeTo(result.spread, 1);
    assert.match(result.reason, /bukan izin entry/); assert.deepEqual(row, before);
  }
});

test('adverse price drift or a wide spread cannot inherit the better candle-close RR', () => {
  for (const side of ['buy', 'sell']) {
    const row = candidate(side);
    Object.assign(row.source, side === 'buy' ? { bid: 100, ask: 106 } : { bid: 94, ask: 100 });
    const result = assessBrokerPlan(row, now);
    assert.equal(result.status, 'blocked'); closeTo(result.riskReward, 14 / 16);
    assert.match(result.reason, /di bawah 1,5R/); assert.equal(row.plan.grossRiskReward, 2);
  }
});

test('stop and target crossings are checked on the closing side of the spread', () => {
  for (const [side, bid, ask] of [['buy', 90, 92], ['sell', 108, 110], ['buy', 120, 121], ['sell', 79, 80], ['buy', 119, 120]]) {
    const row = candidate(side); Object.assign(row.source, { bid, ask });
    const result = assessBrokerPlan(row, now);
    assert.equal(result.status, 'blocked', `${side} ${bid}/${ask}`);
    assert.match(result.reason, /SL atau TP1/); assert.equal(result.riskReward, null);
  }
});

test('scenarios and non-broker feeds are not promoted to executable setups', () => {
  for (const status of ['wait', 'conflict', 'unavailable', 'stale']) {
    const row = candidate(); row.status = status;
    assert.equal(assessBrokerPlan(row, now).status, 'unavailable');
  }
  for (const changes of [{ kind: 'spot' }, { kind: 'reference' }, { isProxy: true }]) {
    const row = candidate(); Object.assign(row.source, changes);
    assert.equal(assessBrokerPlan(row, now).quoteEntry, null);
  }
  const missing = candidate(); missing.plan = null;
  assert.equal(assessBrokerPlan(missing, now).status, 'unavailable');
});

test('broker assessment independently enforces quote and capture deadlines', () => {
  for (const changes of [
    { quoteTime: iso(now - 180_000) }, { capturedAt: iso(now - 180_000) }, { validUntil: iso(now) },
    { quoteTime: iso(now + 30_001) }, { capturedAt: iso(now + 30_001) }, { quoteTime: undefined }, { capturedAt: 'invalid' },
  ]) {
    const row = candidate(); Object.assign(row.source, changes);
    const result = assessBrokerPlan(row, now);
    assert.equal(result.status, 'unavailable'); assert.equal(result.riskReward, null);
  }
});

test('bad prices and reversed SL/TP geometry never produce an RR opportunity', () => {
  for (const changes of [{ bid: NaN }, { ask: Infinity }, { bid: 0 }, { ask: 99 }, { bid: '100' }]) {
    const row = candidate(); Object.assign(row.source, changes);
    assert.equal(assessBrokerPlan(row, now).status, 'unavailable');
  }
  for (const changes of [{ stopLoss: 100 }, { stopLoss: 105 }, { takeProfit: 95 }, { side: 'hold' }, { entry: -1 }]) {
    const row = candidate(); Object.assign(row.plan, changes);
    assert.equal(assessBrokerPlan(row, now).riskReward, null);
  }
});

test('a better quote remains a review only, never a win probability or order permission', () => {
  const row = candidate(); Object.assign(row.source, { bid: 98, ask: 99 });
  const result = assessBrokerPlan(row, now);
  assert.equal(result.status, 'review'); closeTo(result.entryDriftR, -.1); closeTo(result.riskReward, 21 / 9);
  assert.deepEqual(Object.keys(result).sort(), ['entryDriftR', 'quoteEntry', 'reason', 'riskReward', 'spread', 'status']);
});

test('UI fences owner changes, observes resume events, and never dispatches orders', async () => {
  const page = await readFile(new URL('../src/app/signals/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /payload\?\.owner === userId/);
  assert.match(page, /useUserStore\.getState\(\)\.authenticatedUserId !== userId/);
  assert.match(page, /signalDisplayTime\(data.generatedAt/);
  assert.match(page, /visibilitychange/); assert.match(page, /window.addEventListener\('focus'/);
  assert.match(page, /Jangan gunakan entry lama/); assert.match(page, /assessBrokerPlan\(row, currentTime\)/);
  assert.match(page, /api\/trades\/direct/);
  assert.doesNotMatch(page, /order_send|setTradingEnabled/);
  const health = await readFile(new URL('../src/components/trading/signal-feed-health.tsx', import.meta.url), 'utf8');
  assert.match(health, /signalDisplayTime/); assert.match(health, /state\?\.owner === userId/);
});
