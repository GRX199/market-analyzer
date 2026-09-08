import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeAdvancedSignal, analyzeSignalFrame, aggregateCompleteFourHours, referenceSignalPlan,
  signalEMA, signalRSI, signalWilder, signalCandleTime, HORIZON_FRAMES, FRAME_SECONDS,
  manualSignalScenarios,
} from '../src/lib/analysis/advanced-signals.ts';

const now = Date.UTC(2026, 8, 8, 0);
const meta = { symbol: 'BTC/USDT', displaySymbol: 'BTC/USD', name: 'Bitcoin', marketType: 'crypto',
  source: { provider: 'fixture', instrument: 'BTC-USD', isProxy: true, note: 'Reference, not broker execution.' } };
function candles(timeframe = '1H', count = 400, end = now) {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * .03 + Math.sin((i + 5) * .35) * .5;
    return { time: end / 1000 - (count - i) * FRAME_SECONDS[timeframe], open: close - .05,
      high: close + .2, low: close - .2, close, volume: 100 };
  });
}
function breakout(timeframe = '1H') {
  const rows = candles(timeframe);
  rows.at(-1).close += .6; rows.at(-1).high = rows.at(-1).close + .05;
  return rows;
}
const mirror = rows => rows.map(r => ({ ...r, open: 300 - r.open, high: 300 - r.low, low: 300 - r.high, close: 300 - r.close }));
const inputs = (sell = false) => HORIZON_FRAMES.intraday.map(timeframe => ({ timeframe, candles: sell ? mirror(breakout(timeframe)) : breakout(timeframe) }));
const closeTo = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('Wilder RSI preserves flat=50, all gains=100, all losses=0 and fixed numeric fixture', () => {
  assert.equal(signalRSI(Array(30).fill(10)), 50);
  assert.equal(signalRSI(Array.from({ length: 30 }, (_, i) => i)), 100);
  assert.equal(signalRSI(Array.from({ length: 30 }, (_, i) => 30 - i)), 0);
  assert.equal(signalRSI([1, 2, 3]), null);
  const seed = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  closeTo(signalRSI(seed), 70.46413502109705);
  closeTo(signalRSI([...seed, 46.00]), 66.24961855355505);
});

test('EMA uses SMA seed, then 2/(period+1), with no zero-fill warmup', () => {
  assert.deepEqual(signalEMA([1, 2], 3), []);
  const series = signalEMA([1, 2, 3, 4, 5], 3);
  assert.ok(Number.isNaN(series[0])); assert.ok(Number.isNaN(series[1]));
  assert.deepEqual(series.slice(2), [2, 3, 4]);
});

test('ATR, DI and ADX match independently calculated small-period Wilder fixture', () => {
  // period=2: TR 3,3,5,3,3 -> smooth sums 6,8,7,6.5.
  // DM+: 2,0,3,1,0; DM-: 0,1,0,0,1.
  const rows = [
    [10, 8, 9], [12, 9, 11], [11, 8, 9], [14, 10, 13], [15, 12, 14], [14, 11, 12],
  ].map(([high, low, close]) => ({ time: 1, high, low, close, open: close, volume: 0 }));
  // Third TR is 5 because previous close was 9 (gap-aware true range).
  const actual = signalWilder(rows, 2);
  closeTo(actual.atr, 3.25);
  closeTo(actual.plusDI, 100 * 1.5 / 6.5);
  closeTo(actual.minusDI, 100 * 1.125 / 6.5);
  const dx0 = 100 / 3, dx1 = 100 * 3.5 / 4.5, dx2 = 100 * 2.75 / 3.25, dx3 = 100 * .375 / 2.625;
  closeTo(actual.adx, (((dx0 + dx1) / 2 + dx2) / 2 + dx3) / 2);
  assert.equal(signalWilder(rows.slice(0, 3), 2), null);
});

test('timestamp seconds, milliseconds and ISO normalize identically', () => {
  assert.equal(signalCandleTime(now / 1000), now / 1000);
  assert.equal(signalCandleTime(now), now / 1000);
  assert.equal(signalCandleTime(new Date(now).toISOString()), now / 1000);
});

test('active candle cannot repaint an analysis or supply warm-up bars', () => {
  const rows = breakout();
  const before = analyzeSignalFrame({ timeframe: '1H', candles: rows }, now);
  const active = { ...rows.at(-1), time: now / 1000, open: 999, high: 1001, low: 998, close: 1000 };
  assert.deepEqual(analyzeSignalFrame({ timeframe: '1H', candles: [...rows, active] }, now), before);
  assert.equal(analyzeSignalFrame({ timeframe: '1H', candles: [...rows.slice(-249), active] }, now).quality, 'unavailable');
});

test('stale bars and provider failure never become neutral or actionable signals', () => {
  const fresh = analyzeSignalFrame({ timeframe: '1H', candles: breakout() }, now);
  assert.equal(fresh.quality, 'fresh');
  assert.equal(analyzeSignalFrame({ timeframe: '1H', candles: breakout() }, Date.parse(fresh.expiresAt) + 1).quality, 'stale');
  const feed = inputs(); feed[1].error = 'Provider timeout';
  const unavailable = analyzeAdvancedSignal(meta, 'intraday', feed, now);
  assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.plan, null); assert.equal(unavailable.conviction, null);
  assert.ok(unavailable.reasons.some(r => r.includes('Provider timeout')));
  const stale = analyzeAdvancedSignal(meta, 'intraday', inputs(), now + 20 * 60_000);
  assert.equal(stale.status, 'stale'); assert.equal(stale.plan, null);
});

test('invalid/duplicate/out-of-order/future OHLC and invalid clocks fail closed', () => {
  for (const change of [
    rows => rows.push({ ...rows.at(-1) }),
    rows => { [rows[10], rows[11]] = [rows[11], rows[10]]; },
    rows => { rows[20].high = rows[20].low - 1; },
    rows => { rows[20].open = NaN; },
    rows => { rows[20].close = 0; },
    rows => rows.push({ ...rows.at(-1), time: now / 1000 + 3600 }),
  ]) {
    const rows = breakout(); change(rows);
    const frame = analyzeSignalFrame({ timeframe: '1H', candles: rows }, now);
    assert.equal(frame.quality, 'unavailable'); assert.ok(frame.excluded > 0);
  }
  for (const clock of [NaN, Infinity, 0, 1e20]) {
    const row = analyzeAdvancedSignal(meta, 'intraday', inputs(), clock);
    assert.equal(row.status, 'unavailable'); assert.equal(row.plan, null);
    assert.doesNotThrow(() => JSON.stringify(row));
  }
});

test('missing recent bars and a mislabeled interval are rejected even when the last bar is fresh', () => {
  const rows = breakout('15m'); rows.splice(-10, 1);
  assert.equal(analyzeSignalFrame({ timeframe: '15m', candles: rows }, now).quality, 'unavailable');
  assert.match(analyzeSignalFrame({ timeframe: '15m', candles: rows }, now).notes[0], /antara .*Z dan .*Z/);
  const slow = breakout('15m').map((r, i) => ({ ...r, time: now / 1000 - (400 - i) * 1800 }));
  assert.equal(analyzeSignalFrame({ timeframe: '15m', candles: slow }, now).quality, 'unavailable');
});

test('regular metal maintenance is distinguished from unexplained missing trading hours', () => {
  // September: 17:00 New York maintenance = 21:00 UTC.
  const end = Date.UTC(2026, 8, 8, 12);
  const rows = candles('1H', 400, end).filter(row => new Date(row.time * 1000).getUTCHours() !== 21);
  assert.equal(analyzeSignalFrame({ timeframe: '1H', candles: rows, session: 'metal-futures' }, end).quality, 'fresh');
  assert.equal(analyzeSignalFrame({ timeframe: '1H', candles: rows, session: 'continuous' }, end).quality, 'unavailable');
  rows.splice(-8, 1);
  assert.equal(analyzeSignalFrame({ timeframe: '1H', candles: rows, session: 'metal-futures' }, end).quality, 'unavailable');
});

test('daily local-calendar weekends pass, but arbitrary 23/25-hour weekdays fail', () => {
  const rows = candles('1D', 400).filter(row => ![0, 6].includes(new Date(row.time * 1000).getUTCDay()));
  const frame = analyzeSignalFrame({ timeframe: '1D', candles: rows, session: 'forex' }, now);
  assert.equal(frame.quality, 'fresh'); assert.equal(frame.bars, rows.length);
  for (const shift of [-3600, 3600]) {
    const shifted = rows.map((row, i) => ({ ...row, time: row.time + (i < rows.length - 20 ? shift : 0) }));
    assert.equal(analyzeSignalFrame({ timeframe: '1D', candles: shifted, session: 'forex' }, now).quality, 'unavailable');
  }
  rows.splice(-8, 1);
  assert.equal(analyzeSignalFrame({ timeframe: '1D', candles: rows, session: 'forex' }, now).quality, 'unavailable');
});

test('daily DST exceptions are bound to real London/New York timezone transitions', () => {
  for (const [session, cutoff, initialOffset] of [
    ['forex', Date.UTC(2026, 2, 30), 0], ['metal-futures', Date.UTC(2026, 2, 9), 5 * 3600],
  ]) {
    const end = Date.UTC(2026, 3, 3);
    const rows = candles('1D', 400, end)
      .filter(row => ![0, 6].includes(new Date(row.time * 1000).getUTCDay()))
      .map(row => ({ ...row, time: row.time + initialOffset - (row.time >= cutoff / 1000 ? 3600 : 0) }));
    assert.equal(analyzeSignalFrame({ timeframe: '1D', candles: rows, session }, end + 12 * 3600_000).quality, 'fresh', session);
  }
});

test('H4 aggregation requires four unique contiguous H1 bars, including exact bucket alignment', () => {
  const rows = candles('1H', 8);
  const result = aggregateCompleteFourHours(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].open, rows[0].open); assert.equal(result[0].close, rows[3].close);
  assert.equal(result[0].high, Math.max(...rows.slice(0, 4).map(r => r.high))); assert.equal(result[0].volume, 400);
  assert.equal(aggregateCompleteFourHours(rows.slice(1)).length, 1);
  assert.equal(aggregateCompleteFourHours([...rows, rows[0]]).length, 1);
  assert.equal(aggregateCompleteFourHours(rows.map(r => ({ ...r, time: r.time + 60 }))).length, 0);
  const invalid = structuredClone(rows); invalid[0].high = NaN;
  assert.equal(aggregateCompleteFourHours(invalid).length, 1);
});

test('BUY and SELL have symmetric conviction and valid, ordered reference levels', () => {
  const buy = analyzeAdvancedSignal(meta, 'intraday', inputs(), now);
  const sell = analyzeAdvancedSignal(meta, 'intraday', inputs(true), now);
  assert.equal(buy.status, 'candidate'); assert.equal(sell.status, 'candidate');
  assert.equal(buy.conviction, 100); assert.equal(sell.conviction, buy.conviction);
  assert.ok(buy.plan.stopLoss < buy.plan.entry && buy.plan.entry < buy.plan.takeProfit);
  assert.ok(sell.plan.stopLoss > sell.plan.entry && sell.plan.entry > sell.plan.takeProfit);
  closeTo(buy.plan.grossRiskReward, sell.plan.grossRiskReward);
  assert.equal(buy.expiresAt, buy.frames[0].expiresAt);
});

test('higher timeframe conflicts, missing or duplicated frames block reference entries', () => {
  const feed = inputs(); feed[1].candles = mirror(feed[1].candles);
  const conflict = analyzeAdvancedSignal(meta, 'intraday', feed, now);
  assert.equal(conflict.status, 'conflict'); assert.equal(conflict.plan, null);
  assert.equal(analyzeAdvancedSignal(meta, 'intraday', inputs().slice(1), now).status, 'unavailable');
  assert.equal(analyzeAdvancedSignal(meta, 'intraday', [...inputs(), inputs()[0]], now).status, 'unavailable');
});

test('overextended breakout is not actionable even with high confluence', () => {
  const feed = inputs(); const last = feed[0].candles.at(-1); last.close += 10; last.high = last.close + .1;
  const row = analyzeAdvancedSignal(meta, 'intraday', feed, now);
  assert.equal(row.status, 'wait'); assert.equal(row.plan, null);
  assert.ok(row.reasons.some(reason => reason.includes('2,5 ATR')));
});

test('reference plan respects first obstacle, max stop distance and positive levels', () => {
  const frame = { close: 100, atr: 2, support: null, resistance: null };
  const basic = referenceSignalPlan(frame, 'buy').plan;
  assert.equal(basic.stopLoss, 97); assert.equal(basic.takeProfit, 106); assert.equal(basic.secondTarget, 109);
  assert.equal(referenceSignalPlan({ ...frame, resistance: 104 }, 'buy').plan, null);
  const capped = referenceSignalPlan({ ...frame, resistance: 105 }, 'buy').plan;
  closeTo(capped.takeProfit, 104.8); closeTo(capped.grossRiskReward, 1.6); assert.equal(capped.secondTarget, null);
  assert.equal(referenceSignalPlan({ ...frame, support: 90 }, 'buy').plan, null);
  assert.equal(referenceSignalPlan({ ...frame, support: 96 }, 'sell').plan, null);
  assert.equal(referenceSignalPlan({ ...frame, close: 1 }, 'buy').plan, null);
  assert.equal(referenceSignalPlan({ ...frame, atr: 0 }, 'buy').plan, null);
});

test('zero/invalid provider volume is not an invented directional confirmation', () => {
  for (const volume of [0, NaN, -1]) {
    const feed = inputs().map(frame => ({ ...frame, candles: frame.candles.map(row => ({ ...row, volume })) }));
    const result = analyzeAdvancedSignal(meta, 'intraday', feed, now);
    assert.equal(result.conviction, 100); assert.equal(result.frames[0].relativeVolume, null);
  }
});

test('UI fences old filter responses, expires reference levels, and does not arm trades', async () => {
  const page = await readFile(new URL('../src/app/signals/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /requestRef\.current !== controller/);
  assert.match(page, /body\.scope\.symbol !== symbol/);
  assert.match(page, /AbortSignal\.timeout\(45_000\)/);
  assert.match(page, /status === 'candidate' \? row\.plan : null/);
  assert.match(page, /Skor bukan probabilitas menang/);
  assert.match(page, /Scanner klasik/);
  assert.doesNotMatch(page, /api\/trades|order_send|setTradingEnabled/);
});

test('fresh WAIT and conflicting trends expose conditional levels without promoting an entry', () => {
  const feed = inputs(); feed[1].candles = mirror(feed[1].candles);
  const row = analyzeAdvancedSignal(meta, 'intraday', feed, now);
  assert.equal(row.status, 'conflict'); assert.equal(row.plan, null);
  assert.ok(row.manualScenarios.length > 0);
  for (const plan of row.manualScenarios) {
    assert.equal(plan.kind, 'conditional-breakout');
    assert.match(plan.confirmation, /pindai ulang/);
    assert.match(plan.basis, /proyeksi/);
    assert.ok(plan.distanceAtr <= 3);
    if (plan.side === 'buy') assert.ok(plan.stopLoss < plan.entry && plan.entry < plan.takeProfit && plan.takeProfit < plan.secondTarget);
    else assert.ok(plan.stopLoss > plan.entry && plan.entry > plan.takeProfit && plan.takeProfit > plan.secondTarget);
    closeTo(Math.abs(plan.takeProfit - plan.entry) / Math.abs(plan.entry - plan.stopLoss), 2);
  }
});

test('manual scenarios fail closed on stale/missing/invalid feeds and are absent on candidates', () => {
  assert.deepEqual(analyzeAdvancedSignal(meta, 'intraday', inputs(), now).manualScenarios, []);
  assert.deepEqual(analyzeAdvancedSignal(meta, 'intraday', inputs(), now + 20 * 60_000).manualScenarios, []);
  const feed = inputs(); feed[1].error = 'timeout';
  assert.deepEqual(analyzeAdvancedSignal(meta, 'intraday', feed, now).manualScenarios, []);
  feed[1].error = undefined; feed[0].candles[5].close = NaN;
  assert.deepEqual(analyzeAdvancedSignal(meta, 'intraday', feed, now).manualScenarios, []);
});

test('conditional breakout crosses known obstacles, does not imply current confirmation', () => {
  const frames = inputs().map(frame => analyzeSignalFrame(frame, now));
  Object.assign(frames[0], { close: 100, atr: 2, channelHigh: 101, channelLow: 99, resistance: 102, support: 98 });
  const [buy, sell] = manualSignalScenarios(frames);
  closeTo(buy.entry, 102.2); closeTo(sell.entry, 97.8);
  closeTo(buy.stopLoss, 99.2); closeTo(sell.stopLoss, 100.8);
  assert.match(buy.basis, /belum dipetakan/);
  assert.match(sell.invalidation, /Batal/);
  frames[0].resistance = 110;
  assert.deepEqual(manualSignalScenarios(frames).map(p => p.side), ['sell']);
});

test('manual plans never emit invalid prices and cannot use partial frame sets', () => {
  const frames = inputs().map(frame => analyzeSignalFrame(frame, now));
  assert.deepEqual(manualSignalScenarios(frames.slice(0, 2)), []);
  frames[0].atr = 0;
  assert.deepEqual(manualSignalScenarios(frames), []);
});

test('manual UI shows entry SL TP1 TP2 and blocks expired scenario display', async () => {
  const page = await readFile(new URL('../src/app/signals/page.tsx', import.meta.url), 'utf8');
  for (const label of ['Entry referensi', 'Stop Loss', 'Take Profit 1', 'Take Profit 2', 'Bersyarat · belum aktif']) assert.ok(page.includes(label));
  assert.match(page, /status === 'stale' \|\| status === 'unavailable' \? \[\] : row.manualScenarios/);
  assert.match(page, /useState<SignalHorizon>\('intraday'\)/);
});
