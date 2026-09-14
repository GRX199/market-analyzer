import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseBrokerSnapshot } from '../src/lib/analysis/broker-snapshot.ts';
import { parseSignalKlines, fetchBinanceSignalCandles } from '../src/services/api/binance-signals.ts';
const now = Date.UTC(2026, 8, 9, 12);
function fixture() {
  return { symbol: 'BTC/USDT', instrument: 'BTCUSDm', broker: 'Exness Technologies Ltd', server: 'Exness-MT5Trial14', accountKind: 'demo', accountRef: '1'.repeat(24),
    capturedAt: new Date(now).toISOString(), quoteTime: new Date(now).toISOString(), bid: 100, ask: 101,
    frames: Object.entries({ '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 }).map(([timeframe, secs]) => ({ timeframe, candles: Array.from({ length: 320 }, (_, i) => ({ time: now / 1000 - (320 - i) * secs, open: 100, high: 102, low: 99, close: 101, volume: 10 })) })) };
}
test('snapshot strips private/unrecognized fields and accepts only exact CFD/catalog mappings', () => {
  const snapshot = parseBrokerSnapshot({ ...fixture(), password: 'private', user_id: 'someone-else', balance: 100 }, now);
  assert.ok(!('password' in snapshot)); assert.ok(!('user_id' in snapshot)); assert.ok(!('balance' in snapshot));
  for (const instrument of ['BTCUSDm', 'BTCUSDc', 'BTCUSD', 'BTCUSDT']) assert.equal(parseBrokerSnapshot({ ...fixture(), instrument }, now).instrument, instrument);
  for (const instrument of ['BTCUSDother', 'BTCUSD247', 'ETHUSDm', 'BTCUSDmm', 'BTCUSDT_fake']) assert.throws(() => parseBrokerSnapshot({ ...fixture(), instrument }, now), /cocok|Identitas/);
});
test('snapshot fails closed on stale/future quote, bad clocks, wrong candle counts and geometry', () => {
  const mutations = [s => { s.quoteTime = new Date(now - 180_001).toISOString(); }, s => { s.quoteTime = new Date(now + 30_001).toISOString(); },
    s => { s.frames[0].candles.pop(); s.frames[0].candles.length = 249; }, s => { s.frames[0].timeframe = 'toString'; },
    s => { s.frames[0].candles[2].time = s.frames[0].candles[1].time; }, s => { s.frames[0].candles[0].high = 90; },
    s => { s.frames[0].candles.at(-1).time = now / 1000; }, s => { s.ask = 99; }, s => { s.frames[0].candles[0].volume = -1; },
    s => { s.frames[0] = s.frames[1]; }, s => { s.capturedAt = '2026-09-09'; }];
  for (const mutate of mutations) { const s = fixture(); mutate(s); assert.throws(() => parseBrokerSnapshot(s, now)); }
  assert.throws(() => parseBrokerSnapshot(fixture(), NaN));
  const old = { ...fixture(), quoteTime: new Date(now - 3600_000).toISOString() };
  assert.equal(parseBrokerSnapshot(old, now, false).quoteTime, old.quoteTime, 'read path retains metadata to explain stale status');
});
test('Binance decoder rejects null/empty/malformed OHLC and excessive payloads', () => {
  const row = [now, '100', '102', '99', '101', '10', now + 900_000];
  assert.equal(parseSignalKlines([row])[0].time, now / 1000);
  for (const value of [null, {}, [null], [[1]], Array(401).fill(row), [[now, null, '102', '99', '101', 10, 1]], [[now, '', '102', '99', '101', 10, 1]], [[now, 100, 90, 99, 101, 10, 1]]]) assert.throws(() => parseSignalKlines(value));
});
test('Binance native H4 uses market-data endpoint and does not alias BTC/USD', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => { request = { url, options }; return { ok: true, json: async () => [] }; });
  await fetchBinanceSignalCandles('BTC/USDT', '4H');
  const url = new URL(request.url); assert.equal(url.hostname, 'data-api.binance.vision');
  assert.equal(url.searchParams.get('symbol'), 'BTCUSDT'); assert.equal(url.searchParams.get('interval'), '4h'); assert.equal(url.searchParams.get('limit'), '320');
  assert.equal(request.options.redirect, 'error'); assert.equal(request.options.cache, 'no-store');
  await assert.rejects(fetchBinanceSignalCandles('BTC/USD', '1H'));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 451 }));
  await assert.rejects(fetchBinanceSignalCandles('BTC/USDT', '1H'), /451/);
});

function brokerRoute({ user = { id: 'owner' }, rows = [], dbError = null, rpcResult = true } = {}) {
  const calls = [], exports = {};
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/analysis/broker-snapshot': { parseBrokerSnapshot: value => parseBrokerSnapshot(value, now) },
    '@/services/advanced-signals': { ADVANCED_UNIVERSE: [{ symbol: 'BTC/USDT' }, { symbol: 'XAU/USD' }] },
    '@/lib/trading/validation': { getSingleConfiguredUserId: () => 'configured-owner' },
    '@/lib/trading/http': { authorizeWorkerRequest: req => ({ authorized: req.headers.get('authorization') === 'Bearer test-token' }),
      readJsonBody: req => req.json(), RequestBodyError: class extends Error {} },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, from(table) {
        const q = { table }; calls.push(q);
        return { select(columns) { q.columns = columns; return this; }, eq(key, value) { q[key] = value; return this; }, async limit(n) { q.limit = n; return { data: rows, error: dbError }; } };
      } }),
      getSupabaseAdminClient: () => ({ rpc: async (fn, params) => { calls.push({ fn, params }); return { data: rpcResult, error: dbError }; } }),
    },
  };
  const code = ts.transpileModule(readFileSync(new URL('../src/app/api/signals/broker/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process: { env: {} }, Date: class extends Date { static now() { return now; } }, require: id => { if (!(id in deps)) throw new Error(id); return deps[id]; } });
  return { ...exports, calls };
}
test('bridge POST authenticates before parsing and binds writes to server owner', async () => {
  const api = brokerRoute();
  assert.equal((await api.POST(new Request('https://test/api/signals/broker', { method: 'POST', body: 'invalid json' }))).status, 401);
  assert.equal(api.calls.length, 0);
  const response = await api.POST(new Request('https://test/api/signals/broker', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ ...fixture(), user_id: 'attacker' }) }));
  assert.equal(response.status, 200); assert.equal(api.calls[0].fn, 'publish_signal_snapshot');
  assert.equal(api.calls[0].params.p_user_id, 'configured-owner'); assert.ok(!('user_id' in api.calls[0].params.p_payload));
});
test('bridge GET is private, owner-scoped, never exposes account numbers or robot-online claims', async () => {
  const anonymous = brokerRoute({ user: null }); assert.equal((await anonymous.GET()).status, 401); assert.equal(anonymous.calls.length, 0);
  const api = brokerRoute({ rows: [{ symbol: 'BTC/USDT', payload: { ...fixture(), login: 123, balance: 100 } }] });
  const response = await api.GET(), body = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(api.calls[0].user_id, 'owner'); assert.equal(body.robotProcess, 'unknown'); assert.equal(body.dataOnly, true);
  assert.equal(body.feeds[0].fresh, true); assert.ok(!('accountRef' in body.feeds[0])); assert.ok(!('login' in body.feeds[0]));
  assert.equal((await brokerRoute({ dbError: { code: '42P01' } }).GET()).status, 503);
});
test('snapshot migration keeps row-level read isolation and monotonic server-only publication', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260908000100_add_signal_broker_snapshots.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i); assert.match(sql, /auth\.uid\(\)\s*=\s*user_id/i);
  assert.match(sql, /excluded\.captured_at\s*>/i); assert.match(sql, /GRANT EXECUTE[\s\S]*service_role/i);
});
