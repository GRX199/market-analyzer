import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { manualOrderLabel, validateManualOrderDraft } from '../src/lib/trading/manual-order-ticket.ts';

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

test('Signals page exposes four manual ticket actions and a guarded direct-order route', async () => {
  const source = await readFile(new URL('../src/app/signals/page.tsx', import.meta.url), 'utf8');
  for (const type of ['buy_limit', 'buy_stop', 'sell_limit', 'sell_stop']) assert.match(source, new RegExp(type));
  for (const label of ['BUY LIMIT', 'BUY STOP', 'SELL LIMIT', 'SELL STOP']) assert.equal(manualOrderLabel(label.toLowerCase().replace(' ', '_')), label);
  assert.match(source, /\.sort\(\(left, right\) => compareSignals\(left, right/);
  assert.match(source, /Salin template MT5/);
  assert.match(source, /fetch\(['"]\/api\/trades\/direct/);
});
