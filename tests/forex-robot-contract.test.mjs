import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { calculateForexATR, calculateForexRSI } from '../src/lib/trading/forex-preview-indicators.ts';

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
    '@/services/market-data': {
      getOHLCV: async (symbol, timeframe) => { requests.push({ symbol, timeframe }); return []; },
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
    assert.deepEqual(requests.at(-1), { symbol: 'XAU/USD', timeframe });
    assert.match(response.headers.get('Cache-Control'), /no-store/);
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
  assert.match(sidebar, /href: '\/forex-robot'/);
  assert.match(operations, /href="\/forex-robot"/);
});
