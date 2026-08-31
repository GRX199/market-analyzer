import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAlertDraft } from '../src/lib/alerts/draft.ts';

const baseDraft = {
  symbol: 'BTC/USDT',
  marketType: 'crypto',
  alertType: 'price_above',
  targetValue: '75000',
  targetSignal: 'strong_buy',
  timeframe: '1H',
};

test('signal alerts do not require a target price', () => {
  const result = validateAlertDraft({
    ...baseDraft,
    alertType: 'signal_change',
    targetValue: '',
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.targetValue, null);
  assert.equal(result.value.targetSignal, 'strong_buy');
  assert.equal(result.value.timeframe, '1H');
});

test('alert drafts reject unsupported custom symbols and mismatched markets', () => {
  assert.deepEqual(
    validateAlertDraft({ ...baseDraft, symbol: 'CUSTOM/USDT' }),
    { valid: false, error: 'Pilih simbol yang didukung oleh feed market.' },
  );
  assert.deepEqual(
    validateAlertDraft({ ...baseDraft, marketType: 'stocks' }),
    { valid: false, error: 'Jenis market tidak cocok dengan simbol yang dipilih.' },
  );
});

test('price alerts require a finite positive target', () => {
  assert.equal(validateAlertDraft({ ...baseDraft, targetValue: '' }).valid, false);
  assert.equal(validateAlertDraft({ ...baseDraft, targetValue: '-1' }).valid, false);
  assert.equal(validateAlertDraft(baseDraft).valid, true);
});
