import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { calculateForexATR, calculateForexRSI } from '../src/lib/trading/forex-preview-indicators.ts';
import { forexPreviewExpiry, parseForexPreview, presentForexPreview } from '../src/lib/trading/forex-preview-presentation.ts';

test('preview ATR uses the robot rolling true-range mean after a volatility spike', () => {
  const candles = Array.from({ length: 30 }, (_, index) => ({
    time: index * 900, open: 100, close: 100, high: index === 5 ? 150 : 101,
    low: 99, volume: 1,
  }));
  assert.equal(calculateForexATR(candles), 2);
  candles.at(-1).high = 115;
  assert.equal(calculateForexATR(candles), 3);
  assert.ok(Number.isNaN(calculateForexATR(candles.slice(0, 14))));
});

test('preview RSI agrees with the robot for flat, rising, and falling history', () => {
  assert.equal(calculateForexRSI(Array(30).fill(100)), 50);
  assert.equal(calculateForexRSI(Array.from({ length: 30 }, (_, i) => 100 + i)), 100);
  assert.equal(calculateForexRSI(Array.from({ length: 30 }, (_, i) => 100 - i)), 0);
});

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('preview handler validates mode before fetching and requests the matching timeframe', async () => {
  const requests = [];
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/constants': { FOREX_SYMBOLS: [{ symbol: 'XAU/USD', name: 'Gold' }] },
    '@/lib/analysis/technical': { calculateEMA: () => [] },
    '@/lib/trading/forex-preview-indicators': { calculateForexATR, calculateForexRSI },
    '@/lib/trading/forex-preview-presentation': { forexPreviewExpiry },
    '@/services/api/yahoo-finance': {
      fetchYahooSignalCandles: async (symbol, market, timeframe) => { requests.push({ symbol, market, timeframe }); return []; },
    },
  };
  const compiled = ts.transpileModule(await source('src/app/api/forex-robot/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(compiled.outputText, {
    exports, URL, Date, console,
    require: (name) => {
      assert.ok(name in modules, `unexpected external dependency: ${name}`);
      return modules[name];
    },
  });
  const invalid = await exports.GET(new Request('http://test/api/forex-robot?mode=unknown'));
  assert.equal(invalid.status, 400);
  assert.equal(requests.length, 0);
  for (const [mode, timeframe] of [['stable_h1', '1H'], ['aggressive_m15', '15m']]) {
    const response = await exports.GET(new Request(`http://test/api/forex-robot?mode=${mode}`));
    const payload = await response.json();
    assert.equal(payload.data.strategyMode, mode);
    assert.equal(payload.data.timeframe, timeframe);
    assert.equal(payload.data.rows[0].signal, 'unavailable');
    assert.equal(payload.data.sourceInstrument, 'GC=F');
    assert.equal(payload.data.isProxy, true);
    assert.ok(parseForexPreview(payload));
    assert.deepEqual(requests.at(-1), { symbol: 'XAU/USD', market: 'forex', timeframe });
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
});

const scanTime = Date.parse('2026-09-15T01:00:10Z');
const iso = value => new Date(value).toISOString();
function previewPayload(signal = 'buy', mode = 'stable_h1') {
  const timeframe = mode === 'stable_h1' ? '1H' : '15m';
  const close = scanTime - 10_000;
  return { success: true, data: { scannedAt: iso(scanTime), strategyMode: mode, timeframe,
    source: 'Yahoo Finance preview', sourceInstrument: 'GC=F', isProxy: true,
    rows: [{ symbol: 'XAU/USD', name: 'Gold', signal, reason: 'test', price: 100,
      stopLoss: signal === 'sell' ? 110 : 90, takeProfit: signal === 'sell' ? 80 : 120,
      candleOpenedAt: iso(close - (timeframe === '1H' ? 3_600_000 : 900_000)), lastClosedAt: iso(close),
      expiresAt: iso(forexPreviewExpiry(timeframe, iso(scanTime), iso(close), signal)) }] } };
}

test('forex candidates expire at 120 seconds from actual close, not candle open or fetch time', () => {
  for (const mode of ['stable_h1', 'aggressive_m15']) for (const side of ['buy', 'sell']) {
    const payload = previewPayload(side, mode), parsed = parseForexPreview(payload);
    assert.ok(parsed);
    assert.equal(presentForexPreview(parsed, scanTime + 109_999)[0].signal, side);
    const stale = presentForexPreview(parsed, scanTime + 110_000)[0];
    assert.equal(stale.signal, 'stale');
    assert.equal(stale.stopLoss, null);
    assert.equal(stale.takeProfit, null);
    assert.equal(parsed.rows[0].signal, side); // Presentation never mutates evidence.
    assert.equal(presentForexPreview(parsed, scanTime + 86_400_000)[0].signal, 'stale');
    assert.equal(presentForexPreview(parsed, Infinity)[0].signal, 'stale');
  }
});

test('WAIT preview expires after five minutes and never shows trade levels', () => {
  const parsed = parseForexPreview(previewPayload('wait'));
  assert.equal(parsed.rows[0].stopLoss, null);
  assert.equal(parsed.rows[0].takeProfit, null);
  assert.equal(presentForexPreview(parsed, scanTime + 299_999)[0].signal, 'wait');
  assert.equal(presentForexPreview(parsed, scanTime + 300_000)[0].signal, 'stale');
});

test('preview parser rejects mismatched modes, unlabelled proxies, invalid numbers and timestamps', () => {
  for (const mutate of [
    p => { p.success = false; }, p => { p.data.timeframe = '15m'; },
    p => { p.data.isProxy = false; }, p => { delete p.data.sourceInstrument; },
    p => { p.data.scannedAt = 'yesterday'; }, p => { p.data.rows = []; },
    p => { p.data.scannedAt = '2026-02-30T01:00:00Z'; },
    p => { p.data.rows.push(p.data.rows[0]); }, p => { p.data.rows[0].price = true; },
    p => { p.data.rows[0].price = '100'; }, p => { p.data.rows[0].stopLoss = 150; },
    p => { p.data.rows[0].takeProfit = -1; }, p => { delete p.data.rows[0].lastClosedAt; },
    p => { p.data.rows[0].lastClosedAt = iso(scanTime + 1000); },
    p => { p.data.rows[0].expiresAt = iso(scanTime + 120_000); },
    p => { p.data.rows[0].candleOpenedAt = p.data.rows[0].lastClosedAt; },
  ]) {
    const payload = previewPayload(); mutate(payload); assert.equal(parseForexPreview(payload), null);
  }
});

test('missing/malformed expiry and future scan cannot produce a live preview even without parser', () => {
  for (const expiry of [undefined, 'invalid']) {
    const parsed = parseForexPreview(previewPayload()); parsed.rows[0].expiresAt = expiry;
    assert.equal(presentForexPreview(parsed, scanTime)[0].signal, 'stale');
  }
  assert.equal(presentForexPreview(parseForexPreview(previewPayload()), scanTime - 1)[0].signal, 'stale');
});

test('route rejects expired breakouts and corrupt history instead of emitting an old candidate', async () => {
  const closedAt = Date.parse('2026-09-15T01:00:00Z');
  const history = Array.from({ length: 230 }, (_, index) => {
    const close = 4000 + index;
    return { time: (closedAt / 1000) - (230 - index) * 3600, open: close - 1, high: close + 1, low: close - 2, close, volume: 1 };
  });
  history.at(-1).close += 10; history.at(-1).high += 10;
  let now = closedAt + 10_000;
  let data = history;
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/constants': { FOREX_SYMBOLS: [{ symbol: 'XAU/USD', name: 'Gold' }] },
    '@/lib/analysis/technical': { calculateEMA: (closes, period) => closes.map((close, index) => close - period + index / 100) },
    '@/lib/trading/forex-preview-indicators': { calculateForexATR, calculateForexRSI },
    '@/lib/trading/forex-preview-presentation': { forexPreviewExpiry },
    '@/services/api/yahoo-finance': { fetchYahooSignalCandles: async () => data },
  };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const compiled = ts.transpileModule(await source('src/app/api/forex-robot/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(compiled.outputText, { exports, URL, Date: TestDate, console: { error: () => {} }, require: name => modules[name] });
  async function getRow() {
    const response = await exports.GET(new Request('http://test/api/forex-robot?mode=stable_h1'));
    const payload = await response.json();
    assert.ok(parseForexPreview(payload), 'server output must satisfy client contract');
    return payload.data.rows[0];
  }
  const fresh = await getRow();
  assert.equal(fresh.signal, 'buy');
  assert.equal(Date.parse(fresh.lastClosedAt), closedAt);
  assert.equal(Date.parse(fresh.candleOpenedAt), closedAt - 3_600_000);
  assert.equal(Date.parse(fresh.expiresAt), closedAt + 120_000);
  now = closedAt + 120_000;
  const old = await getRow();
  assert.equal(old.signal, 'stale');
  assert.equal(old.stopLoss, null); assert.equal(old.takeProfit, null);
  now = closedAt + 10_000;
  // The forming candle cannot supply a new breakout.
  data = [...history, { time: closedAt / 1000, open: 9000, close: 9001, high: 9002, low: 8999, volume: 1 }];
  assert.equal((await getRow()).price, fresh.price);
  for (const mutate of [
    h => { h[20].high = 1; }, h => { h[20].open = NaN; },
    h => { h[20].low = null; },
    h => { h[20].time = h[19].time; }, h => { h[20].time = h[18].time; },
    h => { h.at(-1).time = (now + 60_000) / 1000; },
  ]) {
    data = structuredClone(history); mutate(data);
    assert.equal((await getRow()).signal, 'unavailable');
  }
});

test('forex robot preview exposes separate stable H1 and aggressive M15 gates', async () => {
  const route = await source('src/app/api/forex-robot/route.ts');

  assert.match(route, /stable_h1/);
  assert.match(route, /aggressive_m15/);
  assert.match(route, /timeframe: '1H'/);
  assert.match(route, /timeframe: '15m'/);
  assert.match(route, /time < activeCandleStart/);
  assert.match(route, /calculateEMA\(closes, 50\)/);
  assert.match(route, /calculateEMA\(closes, 200\)/);
  assert.match(route, /BREAKOUT_LOOKBACK = 20/);
  assert.match(route, /RSI_RECOVERY_LEVEL = 45/);
  assert.match(route, /emaSeparationAtr >= 0\.5/);
  assert.match(route, /atrStopMultiplier: 3/);
  assert.match(route, /rewardRiskRatio: 10/);
  assert.match(route, /atrStopMultiplier: 2/);
  assert.match(route, /rewardRiskRatio: 2/);
  assert.match(route, /Mode strategi Forex tidak valid/);
  assert.match(route, /private, no-store/);
});

test('forex robot page separates preview data from local MT5 execution', async () => {
  const [page, sidebar, operations] = await Promise.all([
    source('src/app/forex-robot/page.tsx'),
    source('src/components/layout/sidebar.tsx'),
    source('src/app/operations/page.tsx'),
  ]);

  assert.match(page, /Robot Forex/);
  assert.match(page, /Monitor website tidak menyalakan atau mematikan proses MT5/);
  assert.match(page, /run_demo_stable_h1\.bat/);
  assert.match(page, /run_demo_aggressive_m15\.bat/);
  assert.match(page, /Pemilih di halaman ini hanya mengubah preview/);
  assert.match(page, /setInterval\(\(\) => void refresh\(true\), 5 \* 60_000\)/);
  assert.match(page, /setPreview\(null\)/);
  assert.match(page, /Pembaruan melewati batas 20 detik/);
  assert.doesNotMatch(page, /Data terakhir tetap ditampilkan/);
  assert.match(page, /GC=F futures/);
  assert.match(sidebar, /href: '\/forex-robot'/);
  assert.match(operations, /href="\/forex-robot"/);
});
