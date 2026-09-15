import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/lib/forex-news/model.ts';
import { parseDirectTradeInput, isTradeId } from '../src/lib/trading/validation.ts';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, URL, AbortSignal, ...globals, require(id) { assert.ok(id in modules, `Unexpected ${id}`); return modules[id]; } });
  return exports;
}
const now = Date.parse('2026-09-15T12:30:10Z');
const event = (changes = {}) => ({ id: 'tradingeconomics:42', provider: 'tradingeconomics', title: 'CPI y/y', currency: 'USD', scheduledAt: '2026-09-15T12:30:00Z', precise: true, importance: 3, actual: '3.1%', forecast: '3.0%', previous: '2.9%', revised: '', source: 'BLS', sourceUrl: 'https://www.bls.gov', updatedAt: '2026-09-15T12:30:01Z', ...changes });
const feed = (e = event(), changes = {}) => ({ events: [e], provider: e.provider, fetchedAt: new Date(now).toISOString(), actualsSupported: true, note: '', ...changes });
const schedule = (changes = {}) => ({ id: '00000000-0000-4000-8000-000000000001', user_id: 'owner', event_id: event().id, event: event({ actual: '' }), symbol: 'XAU/USD', instrument: 'XAUUSDc', account_kind: 'real', account_ref: 'a'.repeat(24), order_type: 'buy_stop', volume: 0.01, entry_price: 101, stop_loss: 99, take_profit: 105, condition: 'actual_above', scheduled_at: '2026-09-15T12:30:00Z', expires_at: '2026-09-15T12:31:30Z', offset_seconds: 0, status: 'armed', ...changes });

test('economic values handle units, signed zero, counts, grouping and reject ranges', () => {
  assert.equal(model.surprise('100K', '0.1M'), 0);
  assert.equal(model.surprise('1.001K', '1001'), 0);
  assert.equal(model.surprise('0%', '-0.1%'), .1);
  assert.equal(model.surprise('1,200', '900'), 300);
  for (const value of ['1,2', '2-3%', 'N/A', '', 'Infinity', '<2', '1.2.3', '1,200,00']) assert.equal(model.economicNumber(value), null, value);
  assert.equal(model.surprise('1%', '1'), null);
});
test('macro interpretation inverts unemployment, handles ambiguous speeches and no future actual', () => {
  assert.match(model.analyzeEvent(event(), now).bias, /menguat/);
  assert.match(model.analyzeEvent(event({ title: 'Unemployment Rate' }), now).bias, /melemah/);
  assert.equal(model.analyzeEvent(event({ title: 'Fed Chair Speaks' }), now).polarity, 0);
  assert.equal(model.analyzeEvent(event(), now - 20000).delta, null);
  assert.ok(model.affectedPairs('USD').includes('XAU/USD'));
  assert.ok(!model.affectedPairs('EUR').includes('XAU/USD'));
  assert.match(model.pairImplication('USD', 'XAU/USD', 1), /SELL/);
  assert.match(model.pairImplication('USD', 'USD/JPY', 1), /BUY/);
  assert.match(model.pairImplication('GBP', 'GBP/USD', -1), /SELL/);
  assert.match(model.pairImplication('GBP', 'GBP/USD', 0), /Tidak ada/);
});
test('schedule never runs early, late or after event time changes', () => {
  assert.equal(model.releaseDecision(schedule(), feed(), now - 20000).state, 'wait');
  assert.equal(model.releaseDecision(schedule(), feed(), now + 80000).state, 'expired');
  assert.equal(model.releaseDecision(schedule(), feed(event({ scheduledAt: '2026-09-15T13:30:00Z' })), now).state, 'blocked');
  assert.equal(model.releaseDecision(schedule(), feed(event({ precise: false })), now).state, 'blocked');
  assert.equal(model.releaseDecision(schedule(), feed(undefined, { events: [] }), now).state, 'blocked');
});
test('actual gate uses frozen consensus, not provider revisions', () => {
  assert.equal(model.releaseDecision(schedule(), feed(event({ forecast: '5%' })), now).state, 'ready');
  assert.equal(model.releaseDecision(schedule({ condition: 'actual_below' }), feed(), now).state, 'blocked');
  assert.equal(model.releaseDecision(schedule(), feed(event({ actual: '3%' })), now).state, 'blocked');
  assert.equal(model.releaseDecision(schedule({ condition: 'at_time' }), feed(event({ actual: '' }), { actualsSupported: false }), now).state, 'ready');
});
test('actual gate requires timestamped release data and compatible numbers', () => {
  for (const [e, f] of [[{ actual: '' }, {}], [{ actual: '3.1' }, {}], [{ updatedAt: null }, {}], [{ updatedAt: 'bad' }, {}], [{ updatedAt: '2026-09-15T12:29:59Z' }, {}], [{ updatedAt: '2026-09-15T12:31:00Z' }, {}], [{}, { actualsSupported: false }], [{}, { fetchedAt: '2026-09-15T12:29:00Z' }], [{}, { fetchedAt: '2026-09-15T13:00:00Z' }]]) {
    assert.equal(model.releaseDecision(schedule(), feed(event(e), f), now).state, 'wait');
  }
  assert.equal(model.releaseDecision(schedule({ expires_at: 'bad' }), feed(), now).state, 'blocked');
});
function calendarService(env = {}, fetcher = () => { throw new Error('unexpected fetch'); }) {
  return load('src/services/economic-calendar.ts', { 'node:crypto': { createHash }, '@/lib/forex-news/model': model }, { process: { env }, fetch: fetcher });
}
test('free weekly feed never fabricates actuals; maps offsets and indefinite events', () => {
  const api = calendarService();
  const rows = api.decodeCalendar([
    { title: 'CPI y/y', country: 'USD', date: '2026-09-15T20:30:00+08:00', impact: 'High', forecast: '3%', previous: '2.9%', actual: '99%' },
    { title: 'Bank Holiday', country: 'JPY', date: '2026-09-15T00:00:00+08:00', impact: 'Holiday' },
    { title: 'Unknown time', country: 'USD', date: '2026-09-15T20:30:00' },
  ], 'forexfactory', now);
  assert.equal(rows.length, 2); assert.equal(rows[0].precise, false);
  assert.equal(rows[1].scheduledAt, '2026-09-15T12:30:00.000Z'); assert.equal(rows[1].actual, '');
});
test('TE UTC, DateSpan and future actual exclusion; duplicate provider IDs fail closed', () => {
  const api = calendarService();
  const raw = { CalendarID: '42', Country: 'United States', Event: 'CPI', Date: '2026-09-15T12:30:00', DateSpan: '0', Actual: '3%', Forecast: '2%', LastUpdate: '2026-09-15T12:30:01', Importance: 3, SourceURL: 'javascript:alert(1)' };
  const [e] = api.decodeCalendar([raw], 'tradingeconomics', now);
  assert.equal(e.currency, 'USD'); assert.equal(e.precise, true); assert.equal(e.actual, '3%');
  assert.ok(e.sourceUrl.startsWith('https:')); assert.equal(e.updatedAt, '2026-09-15T12:30:01.000Z');
  assert.equal(api.decodeCalendar([{ ...raw, DateSpan: 1 }], 'tradingeconomics', now)[0].precise, false);
  assert.equal(api.decodeCalendar([raw], 'tradingeconomics', now - 20000)[0].actual, '');
  assert.throws(() => api.decodeCalendar([raw, raw], 'tradingeconomics', now), /duplikat/);
});
test('provider coalesces requests and never leaks API key on network errors', async () => {
  let calls = 0;
  const api = calendarService({}, async () => { calls++; return new Response('[]'); });
  await Promise.all([api.getEconomicCalendar(), api.getEconomicCalendar()]); await api.getEconomicCalendar();
  assert.equal(calls, 1);
  const denied = calendarService({ TRADING_ECONOMICS_API_KEY: 'PRIVATE' }, async () => { throw new Error('request PRIVATE'); });
  await assert.rejects(denied.getEconomicCalendar(), error => !error.message.includes('PRIVATE'));
});

function processRoute({ rows = [schedule()], authorized = true, snapshot = {}, calendar = feed(), realEnabled = true } = {}) {
  const calls = [], filters = [];
  let calendarCalls = 0;
  const query = { select() { return this; }, eq(...args) { filters.push(args); return this; }, lte(...args) { filters.push(args); return this; }, order() { return this; }, async limit() { return { data: rows, error: null }; } };
  const admin = { from() { calls.push('db'); return query; }, async rpc(name, args) { calls.push({ name, args }); return { data: [{ status: args.p_state }] }; } };
  const modules = {
    '@/lib/trading/http': { authorizeWorkerRequest: () => ({ authorized }), readJsonBody: r => r.json(), RequestBodyError: class extends Error {} },
    '@/lib/trading/validation': { getSingleConfiguredUserId: () => 'owner', parseDirectTradeInput },
    '@/lib/supabase/server': { getSupabaseAdminClient: () => admin },
    '@/services/economic-calendar': { getEconomicCalendar: async () => { calendarCalls++; return calendar; } },
    '@/lib/forex-news/model': model,
    '@/lib/forex-news/server': { newsJson: (body, status = 200) => ({ body, status }), newsTradingError: (_owner, real) => real && !realEnabled ? 'disabled' : null,
      brokerForNews: async () => { if (snapshot === null) throw new Error('offline'); return { accountRef: 'a'.repeat(24), instrument: 'XAUUSDc', ask: 100, bid: 99.9, ...snapshot }; } },
  };
  const api = load('src/app/api/forex-news/orders/process/route.ts', modules, { process: { env: {} }, Date: class extends Date { static now() { return now; } } });
  return { call: (body = { account_kind: 'real', account_ref: 'a'.repeat(24) }) => api.POST({ json: async () => body }), calls, filters, calendarCalls: () => calendarCalls };
}
test('processing rejects unauthenticated, malformed and disabled-real requests before writes', async () => {
  const unauthorized = processRoute({ authorized: false }); assert.equal((await unauthorized.call()).status, 401); assert.equal(unauthorized.calls.length, 0);
  const malformed = processRoute(); assert.equal((await malformed.call({ account_kind: 'real' })).status, 400); assert.equal(malformed.calls.length, 0);
  const disabled = processRoute({ realEnabled: false }); assert.equal((await disabled.call()).status, 403); assert.equal(disabled.calls.length, 0);
});
test('dispatch binds owner, exact account and quote; queues only confirmed levels', async () => {
  const h = processRoute(); assert.equal((await h.call()).status, 200);
  assert.ok(h.filters.some(([key, value]) => key === 'user_id' && value === 'owner'));
  assert.ok(h.filters.some(([key, value]) => key === 'account_ref' && value === 'a'.repeat(24)));
  const args = h.calls.find(c => c.name)?.args; assert.equal(args.p_state, 'queued'); assert.equal(args.p_quote, 100); assert.equal(args.p_owner, 'owner');
});
test('empty/expired queues do not fetch calendar; transient bridge failure does not dispatch', async () => {
  for (const rows of [[], [schedule({ expires_at: new Date(now - 1).toISOString() })]]) {
    const h = processRoute({ rows }); await h.call(); assert.equal(h.calendarCalls(), 0);
    if (rows.length) assert.equal(h.calls.find(c => c.name).args.p_state, 'expired');
  }
  const missing = processRoute({ snapshot: null }); await missing.call(); assert.equal(missing.calls.filter(c => c.name).length, 0);
});
test('mismatched account and moved quote block rather than alter the order', async () => {
  for (const snapshot of [{ accountRef: 'b'.repeat(24) }, { instrument: 'XAUUSDm' }, { ask: 102 }]) {
    const h = processRoute({ snapshot }); await h.call(); assert.equal(h.calls.find(c => c.name).args.p_state, 'blocked');
  }
});
test('SQL locks schedule before dispatch deadline check and protects legacy workers', () => {
  const sql = source('supabase/migrations/20260915000200_add_forex_news_schedules.sql');
  assert.ok(sql.indexOf('FOR UPDATE;') < sql.indexOf('utc_now := clock_timestamp();'));
  assert.match(sql, /queued\.news_valid_until IS NULL OR queued\.broker_account_ref = \$5/);
  assert.match(sql, /GRANT SELECT ON public.forex_news_orders TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.transition_forex_news_order/);
});
test('client persists exact request before send and scopes saved drafts to owner', () => {
  const ui = source('src/app/forex-news/page.tsx');
  assert.ok(ui.indexOf('sessionStorage.setItem') < ui.indexOf("fetch('/api/forex-news/orders'"));
  assert.match(ui, /draftId\.current \|\|= crypto\.randomUUID/);
  assert.match(ui, /draft.request.ownerId === owner/);
  assert.match(ui, /row.source.isProxy/);
  assert.match(ui, /Diterima broker/);
});

test('creation authenticates and freezes reviewed forecast, rejects changed events before quote lookup', async () => {
  const future = event({ scheduledAt: new Date(Date.now() + 60000).toISOString() });
  let quoteCalls = 0, inserts = 0;
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; }, insert() { inserts++; return this; }, async single() { return { data: {} }; } };
  const modules = {
    'node:crypto': { createHash }, '@/lib/supabase/server': { getSupabaseAdminClient: () => ({ from: () => query }) },
    '@/services/economic-calendar': { getEconomicCalendar: async () => feed(future) }, '@/lib/forex-news/model': model,
    '@/lib/forex-news/server': { newsUser: async () => ({ id: 'owner' }), newsTradingError: () => null, newsJson: (body, status = 200) => ({ body, status }), brokerForNews: async () => { quoteCalls++; return {}; } },
    '@/lib/trading/validation': { isTradeId, parseDirectTradeInput }, '@/lib/trading/http': { readJsonBody: r => r.json(), RequestBodyError: class extends Error {} },
  };
  const route = load('src/app/api/forex-news/orders/route.ts', modules);
  const body = { id: schedule().id, ownerId: 'owner', accountKind: 'real', eventId: future.id, eventTime: future.scheduledAt, forecast: '999%', confirmed: true };
  assert.equal((await route.POST({ json: async () => body })).status, 409);
  assert.equal(quoteCalls, 0); assert.equal(inserts, 0);
  assert.equal((await route.POST({ json: async () => ({ ...body, ownerId: 'different' }) })).status, 409);
});

test('schedule creation retry returns original identity even after provider changes; conflicting edits cannot duplicate', async () => {
  const future = event({ scheduledAt: new Date(Date.now() + 60000).toISOString() });
  let row = null, inserts = 0, feeds = 0;
  const filters = [];
  const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { data: row }; }, insert(value) { inserts++; row = { ...value, status: 'armed' }; return this; },
    async single() { return { data: row }; } };
  const modules = {
    'node:crypto': { createHash }, '@/lib/supabase/server': { getSupabaseAdminClient: () => ({ from: () => query }) },
    '@/services/economic-calendar': { getEconomicCalendar: async () => { feeds++; if (feeds > 1) throw new Error('no longer available'); return feed(future); } },
    '@/lib/forex-news/model': model,
    '@/lib/forex-news/server': { newsUser: async () => ({ id: 'owner', client: { from: () => query } }), newsTradingError: () => null,
      newsJson: (body, status = 200) => ({ body, status }), brokerForNews: async () => ({ instrument: 'XAUUSDc', accountRef: 'a'.repeat(24), ask: 100, bid: 99.9 }) },
    '@/lib/trading/validation': { isTradeId, parseDirectTradeInput }, '@/lib/trading/http': { readJsonBody: r => r.json(), RequestBodyError: class extends Error {} },
  };
  const route = load('src/app/api/forex-news/orders/route.ts', modules);
  const body = { id: schedule().id, ownerId: 'owner', accountKind: 'real', eventId: future.id, eventTime: future.scheduledAt,
    forecast: future.forecast, confirmed: true, symbol: 'XAU/USD', offsetSeconds: 0, condition: 'at_time',
    orderType: 'buy_stop', volume: .01, entryPrice: 101, stopLoss: 99, takeProfit: 105 };
  assert.equal((await route.POST({ json: async () => body })).status, 201);
  const retry = await route.POST({ json: async () => body });
  assert.equal(retry.body.duplicate, true); assert.equal(retry.body.order.id, body.id);
  assert.equal((await route.POST({ json: async () => ({ ...body, volume: 1 }) })).status, 409);
  assert.equal(inserts, 1); assert.equal(feeds, 1); assert.equal(row.account_ref, 'a'.repeat(24));
  assert.equal((await route.GET({ url: `https://test/api/forex-news/orders?id=${body.id}` })).body.order.id, body.id);
  assert.ok(filters.some(([key, value]) => key === 'user_id' && value === 'owner'));
});

test('cancel returns success only for a cancelled row, never for an already queued order', async () => {
  let status = 'queued'; const calls = [];
  const route = load('src/app/api/forex-news/orders/route.ts', {
    'node:crypto': { createHash }, '@/lib/supabase/server': { getSupabaseAdminClient: () => ({ rpc: async (name, args) => { calls.push(args); return { data: [{ status }] }; } }) },
    '@/services/economic-calendar': {}, '@/lib/forex-news/model': model,
    '@/lib/forex-news/server': { newsUser: async () => ({ id: 'owner' }), newsJson: (body, status = 200) => ({ body, status }) },
    '@/lib/trading/validation': { isTradeId }, '@/lib/trading/http': {},
  });
  assert.equal((await route.DELETE({ url: `https://test/api/forex-news/orders?id=${schedule().id}` })).status, 409);
  status = 'cancelled';
  assert.equal((await route.DELETE({ url: `https://test/api/forex-news/orders?id=${schedule().id}` })).status, 200);
  assert.ok(calls.every(call => call.p_owner === 'owner' && call.p_state === 'cancelled'));
});
