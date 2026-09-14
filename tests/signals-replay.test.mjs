import test from 'node:test';
import assert from 'node:assert/strict';
import { closedFramesAt, replayAdvancedSignals, validateReplayDataset, replayMetrics } from '../tools/signals-replay-core.mjs';

const start = Date.UTC(2026, 8, 1) / 1000;
const costs = { spreadFloorPrice: .2, multiplier: 1, feeBpsPerSide: 0, slippageBpsPerSide: 0, holdingBpsPerDay: 0 };
const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture() {
  return { symbol: 'BTC/USDT', instrument: 'BTCUSDm', session: 'continuous', point: .1, tickSize: .1, capturedAt: start + 31 * 14400,
    frames: Object.fromEntries(Object.entries({ '15m': 900, '1H': 3600, '4H': 14400 }).map(([tf, seconds]) => [tf,
      Array.from({ length: 390 }, (_, i) => ({ time: start + (i - 360) * seconds, open: 100, high: 101, low: 99, close: 100, volume: 10, spread: 2 }))])) };
}
const buy = () => ({ status: 'candidate', plan: { side: 'buy', entry: 100, stopLoss: 95, takeProfit: 110 } });
const sell = () => ({ status: 'candidate', plan: { side: 'sell', entry: 100, stopLoss: 105, takeProfit: 90 } });
const run = (data, options = {}) => replayAdvancedSignals(data, { from: start, to: start + 1800, costs, analyze: buy, ...options });
const setBar = (data, index, changes) => Object.assign(data.frames['15m'][360 + index], changes);

test('as-of inputs contain exactly 320 CLOSED bars; forming/future H1 and H4 never leak', () => {
  const data = fixture(), before = closedFramesAt(data, start);
  for (const frame of before) {
    const seconds = { '15m': 900, '1H': 3600, '4H': 14400 }[frame.timeframe];
    assert.equal(frame.candles.length, 320);
    assert.ok(frame.candles.every(b => b.time + seconds <= start));
  }
  const serialized = JSON.stringify(before);
  for (const [tf, seconds] of Object.entries({ '15m': 900, '1H': 3600, '4H': 14400 })) {
    for (const bar of data.frames[tf]) if (bar.time + seconds > start) bar.high *= 100;
  }
  assert.equal(JSON.stringify(closedFramesAt(data, start)), serialized);
});

test('entry happens on next contiguous open, never at the signal candle close', () => {
  const data = fixture(), decisions = [];
  setBar(data, 0, { open: 100.5, high: 101 });
  const result = run(data, { analyze(meta, horizon, frames, now) { decisions.push(now); assert.equal(horizon, 'intraday'); assert.ok(frames[0].candles.at(-1).time < now / 1000); return buy(); } });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryTime, start); assert.equal(result.trades[0].signalTime, start);
  closeTo(result.trades[0].entry, 100.7); assert.deepEqual(decisions, [start * 1000]);
  assert.equal(result.readyForReal, false); assert.equal(result.profitabilityVerified, false);
});

test('current execution-bar spread cannot affect its own entry price or acceptance', () => {
  const data = fixture(); setBar(data, 0, { spread: 9000, high: 111 });
  const result = run(data, { to: start + 900 });
  closeTo(result.trades[0].entry, 100.2); assert.equal(result.trades[0].exitReason, 'target');
});

test('ambiguous OHLC fills the stop first and never reports the target win', () => {
  const data = fixture(); setBar(data, 0, { high: 111, low: 94 });
  const result = run(data, { to: start + 900 });
  assert.equal(result.trades[0].exitReason, 'ambiguous_stop_first'); closeTo(result.trades[0].netR, -1);
  assert.equal(result.metrics.ambiguousStopFirstExits, 1);
});

test('SELL protection uses Ask highs, not the less conservative Bid-only chart', () => {
  const data = fixture(); setBar(data, 0, { high: 104.9 });
  const result = run(data, { analyze: sell, to: start + 900 });
  assert.equal(result.trades[0].exitReason, 'stop'); closeTo(result.trades[0].netR, -1);
});

test('adverse gaps fill beyond SL; favorable TP gaps do not invent extra profit', () => {
  const loss = fixture(); setBar(loss, 1, { open: 90, close: 90, high: 91, low: 89 });
  const losing = run(loss).trades[0]; assert.equal(losing.exitReason, 'gap_stop'); closeTo(losing.exit, 90); assert.ok(losing.netR < -1);
  const win = fixture(); setBar(win, 1, { open: 120, close: 120, high: 121, low: 119 });
  const winning = run(win).trades[0]; assert.equal(winning.exitReason, 'gap_target_capped'); closeTo(winning.exit, 110);
});

test('commission, holding provision and adverse slippage lower net results without rewriting SL/TP', () => {
  const data = fixture(); setBar(data, 1, { high: 111 });
  const before = run(data).trades[0];
  const after = run(data, { costs: { ...costs, feeBpsPerSide: 1, holdingBpsPerDay: 1, slippageBpsPerSide: 1 } }).trades[0];
  assert.ok(after.netR < before.netR); assert.ok(after.commissionPrice > 0); assert.ok(after.holdingPrice > 0);
  assert.ok(after.entry > before.entry); assert.ok(after.exit < before.exit);
  closeTo(after.stopLoss, before.stopLoss); closeTo(after.takeProfit, before.takeProfit);
});

test('fold-end exit is censored locally and cannot borrow a later profitable exit', () => {
  const data = fixture(), baseline = run(data);
  assert.equal(baseline.trades[0].exitReason, 'end_of_fold'); assert.equal(baseline.trades[0].exitTime, start + 1800);
  setBar(data, 2, { high: 10000 });
  assert.deepEqual(run(data).trades, baseline.trades);
});

test('position held at bar open prevents a hindsight same-bar re-entry after its exit', () => {
  const data = fixture(); setBar(data, 1, { high: 111 });
  let calls = 0;
  const result = run(data, { analyze() { calls++; return buy(); } });
  assert.equal(calls, 1); assert.equal(result.counts.entries, 1); assert.equal(result.counts.heldAtOpen, 1);
});

test('gap before entry and bad entry RR are explicit rejects, not free fills', () => {
  const gap = fixture(); gap.frames['15m'].splice(359, 1);
  const skipped = run(gap, { to: start + 900 });
  assert.equal(skipped.counts.gapBeforeEntry, 1); assert.equal(skipped.trades.length, 0);
  const chase = fixture(); setBar(chase, 0, { open: 106, high: 107, low: 105, close: 106 });
  const rejected = run(chase, { to: start + 900 });
  assert.equal(rejected.counts.entryGeometryRejected, 1); assert.equal(rejected.trades.length, 0);
});

test('time stop is independent of future data; WAIT/scenarios never open trades', () => {
  const result = run(fixture(), { to: start + 900, maxHoldingBars: 1 });
  assert.equal(result.trades[0].exitReason, 'time_limit');
  const wait = run(fixture(), { analyze: () => ({ status: 'wait', manualScenarios: [buy().plan], reasons: ['Wait for close'] }) });
  assert.equal(wait.trades.length, 0); assert.equal(wait.reasons['Wait for close'], 2);
});

test('corrupt, partial, unordered and unclosed broker history is never repaired silently', () => {
  for (const patch of [
    data => { data.instrument = 'ETHUSDm'; }, data => { data.point = 0; },
    data => { data.frames['4H'] = data.frames['4H'].slice(0, 200); },
    data => { data.frames['15m'][5].time = data.frames['15m'][4].time; },
    data => { data.frames['1H'][5].high = NaN; },
    data => { data.frames['15m'].at(-1).time = data.capturedAt; },
  ]) { const data = fixture(); patch(data); assert.throws(() => validateReplayDataset(data)); }
  assert.throws(() => run(fixture(), { costs: undefined }));
  assert.throws(() => run(fixture(), { costs: { ...costs, feeBpsPerSide: -1 } }));
  assert.throws(() => run(fixture(), { to: Infinity }));
});

test('metrics retain negative returns and distinguish no losses from proven profitability', () => {
  const result = replayMetrics([{ netR: 1 }, { netR: -2 }, { netR: .5 }]);
  closeTo(result.netR, -.5); closeTo(result.profitFactor, .75); closeTo(result.maxClosedTradeDrawdownR, 2);
  assert.equal(replayMetrics([]).profitFactor, null); assert.equal(replayMetrics([{ netR: 1 }]).profitFactor, null);
});
