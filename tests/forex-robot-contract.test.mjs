import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('forex robot preview mirrors the closed-candle H1 breakout gates', async () => {
  const route = await source('src/app/api/forex-robot/route.ts');

  assert.match(route, /getOHLCV\(symbol, '1H'\)/);
  assert.match(route, /time < activeCandleStart/);
  assert.match(route, /calculateEMA\(closes, 50\)/);
  assert.match(route, /calculateEMA\(closes, 200\)/);
  assert.match(route, /BREAKOUT_LOOKBACK = 20/);
  assert.match(route, /lastCandle\.close > breakoutHigh/);
  assert.match(route, /lastCandle\.close < breakoutLow/);
  assert.match(route, /ATR_STOP_MULTIPLIER = 3/);
  assert.match(route, /REWARD_RISK_RATIO = 10/);
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
  assert.match(page, /run_combined_demo\.bat/);
  assert.match(page, /setInterval\(\(\) => void refresh\(true\), 5 \* 60_000\)/);
  assert.match(sidebar, /href: '\/forex-robot'/);
  assert.match(operations, /href="\/forex-robot"/);
});
