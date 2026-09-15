import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { manualOrderLabel, manualOrderMetrics, manualOrderRequestKey, validateManualOrderDraft } from '../src/lib/trading/manual-order-ticket.ts';

const draft = (orderType, overrides = {}) => ({
  orderType,
  quote: 100,
  entry: orderType.startsWith('buy') ? 99 : 101,
  stopLoss: orderType.startsWith('buy') ? 95 : 105,
  takeProfit: orderType.startsWith('buy') ? 102 : 98,
  secondTarget: orderType.startsWith('buy') ? 104 : 96,
  volume: 0.01,
  ...overrides,
});

test('manual order ticket accepts all pending order geometries', () => {
  for (const type of ['buy_limit', 'buy_stop', 'sell_limit', 'sell_stop']) {
    const result = validateManualOrderDraft(draft(type, {
      entry: type === 'buy_limit' ? 99 : type === 'buy_stop' ? 101 : type === 'sell_limit' ? 101 : 99,
    }));
    assert.equal(result.valid, true, type);
  }
  assert.equal(manualOrderLabel('buy_limit'), 'BUY LIMIT');
  assert.equal(manualOrderLabel('sell_stop'), 'SELL STOP');
});

test('manual order ticket rejects wrong quote side and protection geometry', () => {
  assert.equal(validateManualOrderDraft(draft('buy_limit', { entry: 101 })).valid, false);
  assert.equal(validateManualOrderDraft(draft('sell_stop', { entry: 101 })).valid, false);
  assert.equal(validateManualOrderDraft(draft('buy_limit', { takeProfit: 97 })).valid, false);
  assert.equal(validateManualOrderDraft(draft('sell_limit', { stopLoss: 97 })).valid, false);
});

test('conditional ticket requires explicit acknowledgement and positive volume', () => {
  const conditional = validateManualOrderDraft(draft('buy_stop', { entry: 101, conditional: true }));
  assert.equal(conditional.valid, false);
  assert.match(conditional.error, /bersyarat/);
  assert.equal(validateManualOrderDraft(draft('buy_stop', { entry: 101, conditional: true, acknowledged: true })).valid, true);
  assert.equal(validateManualOrderDraft(draft('buy_stop', { entry: 101, volume: 0 })).valid, false);
});

test('one broker TP works without a second target; optional target cannot reverse protection', () => {
  for (const type of ['buy_limit', 'sell_limit']) {
    for (const secondTarget of [null, undefined]) assert.equal(validateManualOrderDraft(draft(type, { secondTarget })).valid, true);
    for (const secondTarget of [0, NaN, Infinity, 100]) assert.equal(validateManualOrderDraft(draft(type, { secondTarget })).valid, false);
  }
});

test('ticket RR follows edited entry and stop; invalid geometry never gives attractive metrics', () => {
  assert.deepEqual(manualOrderMetrics(draft('buy_limit', { entry: 99, stopLoss: 95, takeProfit: 107, secondTarget: null })),
    { risk: 4, reward: 8, riskReward: 2, quoteDistance: 1 });
  assert.equal(manualOrderMetrics(draft('buy_limit', { entry: 98, stopLoss: 95, takeProfit: 107, secondTarget: null })).riskReward, 3);
  assert.equal(manualOrderMetrics(draft('sell_limit', { entry: 101, stopLoss: 105, takeProfit: 93, secondTarget: null })).riskReward, 2);
  assert.equal(manualOrderMetrics(draft('buy_limit', { stopLoss: 99 })), null);
  assert.equal(manualOrderMetrics(draft('buy_stop', { entry: 99 })), null);
});

test('a transport retry or reload reuses the persisted ID; users and execution parameters stay distinct', () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const request = { symbol: 'XAUUSDc', marketType: 'forex', action: 'buy', orderType: 'buy_limit',
    volume: .01, quotePrice: 100, entryPrice: 99, stopLoss: 95, takeProfit: 107, accountKind: 'real' };
  let sequence = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const first = manualOrderRequestKey(storage, 'owner', request, createId);
  // New object and changed property order simulate a new page after a lost response.
  const reloaded = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(request))).reverse());
  assert.equal(manualOrderRequestKey(storage, 'owner', reloaded, createId), first);
  assert.equal(sequence, 1);
  assert.notEqual(manualOrderRequestKey(storage, 'other-owner', request, createId), first);
  assert.notEqual(manualOrderRequestKey(storage, 'owner', { ...request, volume: .02 }, createId), first);
  assert.notEqual(manualOrderRequestKey(storage, 'owner', { ...request, accountKind: 'demo' }, createId), first);
  assert.throws(() => manualOrderRequestKey({ ...storage, setItem() { throw new Error('storage unavailable'); } }, 'new-owner', request, createId), /storage unavailable/);
});

test('Signals page exposes four manual ticket actions and a guarded direct-order route', async () => {
  const source = await readFile(new URL('../src/app/signals/page.tsx', import.meta.url), 'utf8');
  for (const type of ['buy_limit', 'buy_stop', 'sell_limit', 'sell_stop']) assert.match(source, new RegExp(type));
  for (const label of ['BUY LIMIT', 'BUY STOP', 'SELL LIMIT', 'SELL STOP']) assert.equal(manualOrderLabel(label.toLowerCase().replace(' ', '_')), label);
  assert.match(source, /\.sort\(\(left, right\) => compareSignals\(left, right/);
  assert.match(source, /Salin template MT5/);
  assert.match(source, /fetch\(['"]\/api\/trades\/direct/);
});
