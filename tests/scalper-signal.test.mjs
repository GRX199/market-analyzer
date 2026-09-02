import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BINANCE_HISTORY_LIMIT,
  BINANCE_MIN_SIGNAL_HISTORY,
  getBinanceReconnectDelay,
  hasSufficientClosedHistory,
  mergeClosedKlines,
  parseBinanceRestKlines,
} from '../src/lib/scalping/binance-feed.ts';
import { deriveClosedScalperSignal } from '../src/lib/scalping/signal.ts';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function kline(startTime, open, close, isFinal = true) {
  return {
    startTime,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 1,
    isFinal,
  };
}

test('merges only finalized Binance candles, de-duplicates, sorts, and bounds history', () => {
  const current = Array.from(
    { length: BINANCE_HISTORY_LIMIT },
    (_, index) => kline(index + 1, 100, 101),
  );
  const merged = mergeClosedKlines(current, [
    kline(BINANCE_HISTORY_LIMIT, 100, 102),
    kline(BINANCE_HISTORY_LIMIT + 1, 102, 103),
    kline(BINANCE_HISTORY_LIMIT + 2, 103, 104, false),
  ]);

  assert.equal(merged.length, BINANCE_HISTORY_LIMIT);
  assert.equal(merged[0].startTime, 2);
  assert.equal(merged.at(-2).close, 102);
  assert.equal(merged.at(-1).startTime, BINANCE_HISTORY_LIMIT + 1);
});

test('REST parser excludes the still-forming candle', () => {
  const now = 120_000;
  const parsed = parseBinanceRestKlines([
    [0, '100', '102', '99', '101', '10', 59_999],
    [60_000, '101', '103', '100', '102', '11', 119_999],
    [120_000, '102', '104', '101', '103', '12', 179_999],
  ], now);

  assert.deepEqual(parsed.map((candle) => candle.startTime), [60_000]);
  assert.ok(parsed.every((candle) => candle.isFinal));
});

test('reconnect delay is exponential and capped', () => {
  assert.equal(getBinanceReconnectDelay(1), 1_000);
  assert.equal(getBinanceReconnectDelay(4), 8_000);
  assert.equal(getBinanceReconnectDelay(20), 30_000);
});

test('scalper history readiness fails closed until enough finalized candles exist', () => {
  const shortHistory = Array.from(
    { length: BINANCE_MIN_SIGNAL_HISTORY - 1 },
    (_, index) => kline(index + 1, 100, 101),
  );

  assert.equal(hasSufficientClosedHistory(shortHistory), false);
  assert.equal(
    hasSufficientClosedHistory([
      ...shortHistory,
      kline(BINANCE_MIN_SIGNAL_HISTORY, 101, 102, false),
    ]),
    false,
  );
  assert.equal(
    hasSufficientClosedHistory([
      ...shortHistory,
      kline(BINANCE_MIN_SIGNAL_HISTORY, 101, 102),
    ]),
    true,
  );
});

test('scalper signal ignores a forming candle and treats doji as neutral', () => {
  const rising = Array.from(
    { length: 13 },
    (_, index) => kline((index + 1) * 60_000, 100 + index, 101 + index),
  );
  const formingCrash = kline(14 * 60_000, 114, 1, false);
  const fromClosedOnly = deriveClosedScalperSignal([...rising, formingCrash]);

  assert.equal(fromClosedOnly.action, 'buy');
  assert.equal(fromClosedOnly.sourceCandleStart, 13 * 60_000);

  const withFinalDoji = deriveClosedScalperSignal([
    ...rising,
    kline(14 * 60_000, 114, 114),
  ]);
  assert.equal(withFinalDoji.momentum, 'wait');
  assert.equal(withFinalDoji.action, null);
});

test('scalper robot runtime survives page navigation through the root layout', async () => {
  const [layout, provider, page] = await Promise.all([
    source('src/app/layout.tsx'),
    source('src/components/scalping/scalper-robot-provider.tsx'),
    source('src/app/scalping/page.tsx'),
  ]);

  assert.match(layout, /<ScalperRobotProvider>/);
  assert.match(provider, /useBinanceWebSocket\(symbol, shouldKeepFeedAlive\)/);
  assert.match(provider, /void createAutoTrade\(/);
  assert.match(provider, /Robot tetap aktif saat Anda berpindah halaman/);
  assert.match(provider, /useScalperRobotStatus/);
  assert.doesNotMatch(page, /void createAutoTrade\(/);
});
