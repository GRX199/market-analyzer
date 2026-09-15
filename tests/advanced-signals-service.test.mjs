import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as analysis from '../src/lib/analysis/advanced-signals.ts';
import { parseBrokerSnapshot } from '../src/lib/analysis/broker-snapshot.ts';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function loadModule(code, dependencies, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(compiled, {
    exports, Date, URL, setTimeout, clearTimeout, ...globals,
    require(id) {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return exports;
}
const constants = loadModule(source('src/lib/constants.ts'), {});
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

function makeService() {
  let now = 0, timerId = 0, active = 0, peak = 0, calls = 0;
  const timers = new Map(), controls = [];
  const api = loadModule(`${source('src/services/advanced-signals.ts')}\nexport const __feed = (asset, tf) => feed(asset, tf, 'reference');`, {
    '@/lib/constants': constants,
    '@/lib/analysis/advanced-signals': {
      HORIZON_FRAMES: analysis.HORIZON_FRAMES,
      aggregateCompleteFourHours: candles => candles,
      analyzeAdvancedSignal: (asset, horizon, frames) => ({ ...asset, horizon, frames }),
    },
    '@/lib/analysis/broker-snapshot': { parseBrokerSnapshot },
    '@/services/api/binance-signals': { fetchBinanceSignalCandles() { throw new Error('Unexpected spot request'); } },
    '@/services/api/yahoo-finance': {
      mapSymbolToYahoo: symbol => symbol,
      fetchYahooSignalCandles(symbol, market, timeframe) {
        calls++; active++; peak = Math.max(peak, active);
        return new Promise((resolve, reject) => controls.push({ symbol, market, timeframe, resolve, reject }))
          .finally(() => active--);
      },
    },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, milliseconds) { const id = ++timerId; timers.set(id, { callback, due: now + milliseconds }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { api, controls, stats: () => ({ active, peak, calls, timers: timers.size }),
    async advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
      await flush();
    },
  };
}
const asset = symbol => ({ symbol, displaySymbol: symbol, name: symbol, marketType: 'forex' });
const candle = { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 };

test('feed coalesces pending requests and expires successful cache', async () => {
  const h = makeService();
  const first = h.api.__feed(asset('A'), '1H'), second = h.api.__feed(asset('A'), '1H');
  assert.equal(h.stats().calls, 1); h.controls.shift().resolve([candle]);
  const [one, two] = await Promise.all([first, second]); assert.equal(one, two);
  await h.api.__feed(asset('A'), '1H'); assert.equal(h.stats().calls, 1);
  await h.advance(60_001);
  const renewed = h.api.__feed(asset('A'), '1H'); assert.equal(h.stats().calls, 2);
  h.controls.shift().resolve([candle]); await renewed; assert.equal(h.stats().active, 0);
});

test('four active feeds, twelve waiters, timeout removal and permit recovery', async () => {
  const h = makeService();
  const requests = Array.from({ length: 17 }, (_, i) => h.api.__feed(asset(`Q${i}`), '1H'));
  await flush(); assert.equal(h.stats().active, 4); assert.equal(h.stats().calls, 4);
  assert.match((await requests[16]).error, /sibuk/);
  await h.advance(20_001);
  for (const result of await Promise.all(requests.slice(4, 16))) assert.match(result.error, /sibuk/);
  assert.equal(h.stats().active, 4); assert.equal(h.stats().timers, 0);
  for (const c of h.controls.splice(0)) c.resolve([candle]);
  await Promise.all(requests); assert.equal(h.stats().active, 0);
  const next = Array.from({ length: 4 }, (_, i) => h.api.__feed(asset(`R${i}`), '1H'));
  assert.equal(h.stats().active, 4); assert.equal(h.stats().peak, 4);
  for (const c of h.controls.splice(0)) c.resolve([candle]);
  await Promise.all(next); assert.equal(h.stats().active, 0);
});

test('queued requests receive transferred permits before fresh requests', async () => {
  const h = makeService();
  const requests = Array.from({ length: 6 }, (_, i) => h.api.__feed(asset(`Q${i}`), '1H'));
  h.controls.shift().resolve([candle]); await flush();
  assert.equal(h.stats().calls, 5); assert.equal(h.stats().active, 4);
  assert.equal(h.controls.at(-1).symbol, 'Q4');
  h.controls.shift().reject(new Error('timeout')); await flush();
  assert.equal(h.stats().calls, 6); assert.equal(h.stats().active, 4);
  for (const c of h.controls.splice(0)) c.resolve([candle]);
  await Promise.all(requests); assert.equal(h.stats().active, 0); assert.equal(h.stats().peak, 4);
});

test('provider errors are cached for ten seconds, then retried', async () => {
  const h = makeService(); const pending = h.api.__feed(asset('ERROR'), '1H');
  h.controls.shift().reject(new Error('Upstream unavailable'));
  const failed = await pending; assert.match(failed.error, /gagal/); assert.equal(failed.candles.length, 0);
  await h.api.__feed(asset('ERROR'), '1H'); assert.equal(h.stats().calls, 1);
  await h.advance(10_001);
  const retry = h.api.__feed(asset('ERROR'), '1H'); assert.equal(h.stats().calls, 2);
  h.controls.shift().resolve([candle]); const recovered = await retry;
  assert.equal(recovered.error, undefined); assert.equal(recovered.candles.length, 1);
});

test('partial failure propagates to H1 and H4; provenance remains explicit', async () => {
  const h = makeService(); const pending = h.api.scanAdvancedSignals([asset('XAU/USD')], 'swing', { source: 'reference' });
  h.controls.find(r => r.timeframe === '1H').reject(new Error('Hourly unavailable'));
  h.controls.find(r => r.timeframe === '1D').resolve([candle]);
  const [row] = await pending;
  assert.match(row.frames[0].error, /gagal/); assert.equal(row.frames[1].error, row.frames[0].error);
  assert.equal(row.frames[2].error, undefined); assert.equal(row.source.isProxy, true);
  assert.match(row.source.note, /bukan spot/);
});

function makeRoute({ user = { id: 'test-user' }, authError = null, authThrows = false, scanThrows = false, snapshotRows = [], dbError = null } = {}) {
  const service = makeService().api, scans = [], queries = []; let authCalls = 0;
  const route = loadModule(source('src/app/api/signals/advanced/route.ts'), {
    'next/server': { NextResponse: { json(body, options) {
      return new Response(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    } } },
    '@/lib/supabase/server': { async createServerSupabaseClient() {
      if (authThrows) throw new Error('Auth unavailable');
      return { auth: { async getUser() { authCalls++; return { data: { user }, error: authError }; } }, from(table) {
        const query = { table }; queries.push(query);
        return { select(columns) { query.columns = columns; return this; }, eq(key, value) { query[key] = value; return this; }, async in(key, value) { query[key] = value; return { data: snapshotRows, error: dbError }; } };
      } };
    } },
    '@/services/advanced-signals': { ...service, async scanAdvancedSignals(assets, horizon, options) {
      scans.push({ assets, horizon, options }); if (scanThrows) throw new Error('Scanner unavailable');
      return assets.map(row => ({ symbol: row.symbol, status: 'wait' }));
    } },
  });
  return { request: (query = '') => route.GET(new Request(`https://example.test/api/signals/advanced${query}`)), scans, queries, authCalls: () => authCalls };
}

test('advanced API rejects invalid inputs without auth or provider work', async () => {
  const route = makeRoute();
  const firstInvalidPage = Math.ceil((constants.FOREX_SYMBOLS.length + constants.CRYPTO_SYMBOLS.length) / 6);
  for (const query of ['?source=unknown', '?market=stocks', '?horizon=1H', '?page=-1', '?page=999', `?page=${firstInvalidPage}`, '?symbol=UNKNOWN', '?symbol=', '?market=forex&symbol=BTCUSD']) {
    const response = await route.request(query); assert.equal(response.status, 400, query);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  assert.equal(route.authCalls(), 0); assert.equal(route.scans.length, 0);
});

test('advanced API requires authentication before scanning', async () => {
  for (const options of [{ user: null }, { authError: { message: 'Invalid session' } }]) {
    const route = makeRoute(options); assert.equal((await route.request()).status, 401); assert.equal(route.scans.length, 0);
  }
  const unavailable = makeRoute({ authThrows: true });
  assert.equal((await unavailable.request()).status, 503); assert.equal(unavailable.scans.length, 0);
});

test('default page includes XAU/BTC, all catalog entries reachable and aliases resolve', async () => {
  const route = makeRoute(), response = await route.request();
  assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /private.*no-store/);
  const payload = await response.json(); assert.equal(payload.data.length, 6);
  assert.equal(payload.data[0].symbol, 'XAU/USD'); assert.equal(payload.data[1].symbol, 'BTC/USDT');
  const symbols = new Set();
  for (let page = 0; page < payload.scope.pages; page++) {
    const pageData = await (await route.request(`?page=${page}`)).json();
    for (const row of pageData.data) { assert.ok(!symbols.has(row.symbol)); symbols.add(row.symbol); }
  }
  assert.equal(symbols.size, payload.scope.total); assert.equal(symbols.size, payload.universe.length);
  for (const [alias, canonical] of [['XAUUSD', 'XAU/USD'], ['BTCUSD', 'BTC/USDT'], ['BTCUSDT', 'BTC/USDT'], ['btc-usd', 'BTC/USDT']]) {
    const result = await route.request(`?symbol=${alias}`); assert.equal(result.status, 200);
    const body = await result.json(); assert.equal(body.scope.symbol, canonical); assert.equal(body.data.length, 1);
    assert.equal(body.data[0].symbol, canonical);
  }
});

test('expanded popular markets resolve without aliasing old tokens or changing source', async () => {
  const route = makeRoute();
  const expected = ['BCH/USDT', 'TRX/USDT', 'SUI/USDT', 'NEAR/USDT', 'UNI/USDT', 'AAVE/USDT', 'POL/USDT',
    'NZD/JPY', 'CAD/CHF', 'NZD/CAD', 'NZD/CHF', 'EUR/NZD', 'GBP/NZD'];
  for (const symbol of expected) {
    const source = symbol.endsWith('/USDT') ? 'market' : 'mt5';
    const response = await route.request(`?symbol=${encodeURIComponent(symbol)}&source=${source}`);
    assert.equal(response.status, 200, symbol);
    const body = await response.json();
    assert.equal(body.scope.symbol, symbol); assert.equal(body.scope.source, source);
    assert.equal(body.data.length, 1); assert.equal(body.data[0].symbol, symbol);
  }
  const symbols = [...constants.FOREX_SYMBOLS, ...constants.CRYPTO_SYMBOLS].map(asset => asset.symbol);
  assert.equal(new Set(symbols).size, symbols.length);
  assert.equal(constants.FOREX_SYMBOLS.length, 36); assert.equal(constants.CRYPTO_SYMBOLS.length, 19);
  assert.equal(symbols.includes('MATIC/USDT'), false);
  assert.equal((await route.request('?symbol=MATICUSDT')).status, 400, 'do not silently reinterpret stored MATIC orders as POL');
  for (const item of constants.SIGNAL_QUICK_MARKETS) assert.ok(symbols.includes(item.symbol), item.symbol);
});

test('new crypto CoinGecko identities are exact; old MATIC identity stays separate', () => {
  const gecko = loadModule(`${source('src/services/api/coingecko.ts')}\nexport const __ids = SYMBOL_TO_COINGECKO_ID;`, {});
  for (const [symbol, id] of Object.entries({ BCH: 'bitcoin-cash', TRX: 'tron', SUI: 'sui', NEAR: 'near', UNI: 'uniswap', AAVE: 'aave', POL: 'polygon-ecosystem-token' })) {
    assert.equal(gecko.__ids[`${symbol}/USDT`], id); assert.equal(gecko.isCryptoSymbol(`${symbol}/USDT`), true);
  }
  assert.equal(gecko.__ids['MATIC/USDT'], 'matic-network');
});

test('scanner exception returns non-cacheable service failure', async () => {
  const response = await makeRoute({ scanThrows: true }).request();
  assert.equal(response.status, 503); assert.equal((await response.json()).success, false);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
});

test('broker query is owner-scoped, source-specific and storage errors are not hidden', async () => {
  const route = makeRoute({ snapshotRows: [{ symbol: 'BTC/USDT', payload: { fixture: true } }] });
  const response = await route.request('?source=mt5&symbol=BTCUSD');
  assert.equal(response.status, 200); assert.equal((await response.json()).scope.source, 'mt5');
  assert.equal(route.queries[0].user_id, 'test-user'); assert.deepEqual(Array.from(route.queries[0].symbol), ['BTC/USDT']);
  assert.equal(route.scans[0].options.brokerSnapshots['BTC/USDT'].fixture, true);
  await route.request('?source=market&market=crypto'); await route.request('?source=reference');
  assert.equal(route.queries.length, 1);
  const unavailable = makeRoute({ dbError: { code: '42P01' } });
  assert.equal((await unavailable.request()).status, 200);
  assert.match(unavailable.scans[0].options.brokerError, /migration/);
  const anonymous = makeRoute({ user: null }); await anonymous.request('?source=mt5'); assert.equal(anonymous.queries.length, 0);
});

const scanNow = Date.UTC(2026, 8, 9, 12);
function fixtureSnapshot(symbol = 'XAU/USD', instrument = 'XAUUSDm') {
  return { symbol, instrument, broker: 'Exness Technologies Ltd', server: 'Exness-MT5Trial14', accountKind: 'demo', accountRef: 'a'.repeat(24),
    capturedAt: new Date(scanNow - 60_000).toISOString(), quoteTime: new Date(scanNow - 60_000).toISOString(), bid: 110, ask: 110.1,
    frames: Object.entries(analysis.FRAME_SECONDS).map(([timeframe, seconds]) => ({ timeframe, candles: Array.from({ length: 320 }, (_, i) => {
      const close = 100 + i * .03 + Math.sin(i) * .2;
      return { time: scanNow / 1000 - seconds * (321 - i), open: close - .02, high: close + .2, low: close - .2, close, volume: 10 };
    }) })) };
}
function integratedService() {
  const calls = [];
  const api = loadModule(source('src/services/advanced-signals.ts'), {
    '@/lib/constants': constants, '@/lib/analysis/advanced-signals': analysis,
    '@/lib/analysis/broker-snapshot': { parseBrokerSnapshot },
    '@/services/api/binance-signals': { async fetchBinanceSignalCandles(symbol, tf) { calls.push({ provider: 'binance', symbol, tf }); return fixtureSnapshot().frames.find(f => f.timeframe === tf).candles; } },
    '@/services/api/yahoo-finance': { mapSymbolToYahoo: symbol => symbol, async fetchYahooSignalCandles() { throw new Error('Unexpected Yahoo fallback'); } },
  }, { Date: class extends Date { static now() { return scanNow; } } });
  return { ...api, calls };
}
test('MT5 native source never becomes futures; quote expiry caps all manual levels', async () => {
  const service = integratedService(), snapshot = fixtureSnapshot();
  const [row] = await service.scanAdvancedSignals([asset('XAU/USD')], 'intraday', { brokerSnapshots: { 'XAU/USD': snapshot } });
  assert.equal(row.source.isProxy, false); assert.equal(row.source.instrument, 'XAUUSDm'); assert.equal(row.source.kind, 'broker');
  assert.doesNotMatch(row.source.note, /adalah proxy/); assert.equal(row.source.accountKind, 'demo');
  assert.ok(Date.parse(row.expiresAt) <= Date.parse(snapshot.quoteTime) + 180_000);
  assert.ok(!('accountRef' in row.source)); assert.equal(service.calls.length, 0);
  snapshot.quoteTime = new Date(scanNow - 180_001).toISOString();
  const [stale] = await service.scanAdvancedSignals([asset('XAU/USD')], 'intraday', { brokerSnapshots: { 'XAU/USD': snapshot } });
  assert.equal(stale.status, 'stale'); assert.equal(stale.plan, null); assert.equal(stale.manualScenarios.length, 0);
});
test('missing or mismatched MT5 data fails closed without fictional trend reasons or Yahoo', async () => {
  const service = integratedService();
  const [missing] = await service.scanAdvancedSignals([asset('XAU/USD')], 'intraday');
  assert.equal(missing.status, 'unavailable'); assert.equal(missing.source.provider, 'MT5 Broker');
  assert.ok(missing.reasons.every(r => !r.includes('ADX') && !r.includes('RSI')));
  const [wrong] = await service.scanAdvancedSignals([asset('XAU/USD')], 'intraday', { brokerSnapshots: { 'XAU/USD': fixtureSnapshot('BTC/USDT', 'BTCUSDm') } });
  assert.equal(wrong.status, 'unavailable'); assert.equal(wrong.plan, null); assert.equal(service.calls.length, 0);
});
test('Binance defaults to USDT with three native frames; MT5 BTC must be explicitly selected', async () => {
  const service = integratedService(), btc = { ...asset('BTC/USDT'), marketType: 'crypto' };
  const [spot] = await service.scanAdvancedSignals([btc], 'intraday', { brokerSnapshots: { 'BTC/USDT': fixtureSnapshot('BTC/USDT', 'BTCUSDm') } });
  assert.equal(spot.displaySymbol, 'BTC/USDT'); assert.equal(spot.source.provider, 'Binance Spot');
  assert.deepEqual(service.calls.map(c => c.tf).sort(), ['15m', '1H', '4H']);
  const [broker] = await service.scanAdvancedSignals([btc], 'intraday', { source: 'mt5', brokerSnapshots: { 'BTC/USDT': fixtureSnapshot('BTC/USDT', 'BTCUSDm') } });
  assert.equal(broker.displaySymbol, 'BTC/USD'); assert.equal(broker.source.instrument, 'BTCUSDm'); assert.equal(service.calls.length, 3);
});

test('strict Yahoo feed does not fabricate missing OHLC and isolates scanner requests', async () => {
  const clients = [], timeouts = [];
  class YahooMock {
    constructor() { this.calls = []; clients.push(this); }
    async chart(symbol, options, moduleOptions) {
      this.calls.push({ symbol, options, moduleOptions });
      return { quotes: [
        { date: new Date(1000), open: null, high: null, low: null, close: null },
        { date: new Date(2000), open: null, high: 2, low: 1, close: 1.5, volume: 0 },
        { date: new Date(3000), open: 1, high: 2, low: .5, close: 1.5, volume: 10 },
      ] };
    }
  }
  const api = loadModule(source('src/services/api/yahoo-finance.ts'), {
    'yahoo-finance2': { default: YahooMock },
  }, { AbortSignal: { timeout(ms) { timeouts.push(ms); return 'abort-test'; } } });
  const rows = await api.fetchYahooSignalCandles('XAU/USD', 'forex', '15m');
  assert.equal(rows.length, 2); assert.ok(Number.isNaN(rows[0].open)); assert.equal(rows[1].time, 3);
  assert.equal(clients.length, 2); assert.equal(clients[0].calls.length, 0);
  assert.equal(clients[1].calls[0].symbol, 'GC=F'); assert.equal(clients[1].calls[0].options.interval, '15m');
  assert.equal(clients[1].calls[0].moduleOptions.fetchOptions.signal, 'abort-test'); assert.equal(timeouts[0], 12_000);
  assert.equal(api.mapSymbolToYahoo('BTC/USDT', 'crypto'), 'BTC-USD');
});
