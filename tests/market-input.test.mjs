import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMarketType,
  parseSignalMode,
  parseSupportedSymbol,
  parseTimeframe,
} from '../src/lib/market-input.ts';

test('market input accepts only configured symbols', () => {
  assert.equal(parseSupportedSymbol('BTC-USDT'), 'BTC/USDT');
  assert.equal(parseSupportedSymbol(encodeURIComponent('EUR/USD')), 'EUR/USD');
  assert.equal(parseSupportedSymbol('AAPL'), 'AAPL');
  assert.equal(parseSupportedSymbol('BTC-USDT%0Aignore-rules'), null);
  assert.equal(parseSupportedSymbol('%E0%A4%A'), null);
});

test('market, timeframe, and signal mode validation fail closed', () => {
  assert.equal(
    parseMarketType('crypto', { allowAll: true, optional: true }),
    'crypto',
  );
  assert.equal(
    parseMarketType('all', { allowAll: true, optional: true }),
    'all',
  );
  assert.equal(
    parseMarketType('invalid', { allowAll: true, optional: true }),
    null,
  );
  assert.equal(parseTimeframe('15m'), '15m');
  assert.equal(parseTimeframe('2H'), null);
  assert.equal(parseSignalMode('technical'), 'technical');
  assert.equal(parseSignalMode('anything'), null);
});
