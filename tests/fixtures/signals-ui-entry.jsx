import React from 'react';
import { createRoot } from 'react-dom/client';
import Page from '../../src/app/signals/page';
import { analyzeAdvancedSignal, FRAME_SECONDS } from '../../src/lib/analysis/advanced-signals';

// Synthetic price series; real analysis and UI, no backend or trading connection.
window.fixture = { state: 'candidate', posts: [] };
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (options.method && options.method !== 'GET') {
    window.fixture.posts.push(String(input)); throw new Error('Order submission forbidden in this test');
  }
  if (url.pathname !== '/api/signals/advanced') throw new Error(`Unmocked request: ${url.pathname}`);
  const now = Date.now(), horizon = url.searchParams.get('horizon');
  const frames = (horizon === 'swing' ? ['1H', '4H', '1D'] : ['15m', '1H', '4H']).map(timeframe => {
    const seconds = FRAME_SECONDS[timeframe], end = Math.floor(now / 1000 / seconds) * seconds;
    const candles = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + i * .03 + Math.sin((i + 5) * .35) * .5;
      return { time: end - (400 - i) * seconds, open: close - .05, high: close + .2, low: close - .2, close, volume: 100 };
    });
    candles.at(-1).close += .65; candles.at(-1).high = candles.at(-1).close + .05;
    if (window.fixture.state === 'wait') candles.at(-1).open = candles.at(-1).close - .01;
    return { timeframe, candles, session: 'continuous' };
  });
  const close = frames[0].candles.at(-1).close;
  const meta = { symbol: 'XAU/USD', displaySymbol: 'XAU/USD', name: 'Gold fixture', marketType: 'forex',
    source: { kind: 'broker', provider: 'MT5 fixture', instrument: 'XAUUSDm', isProxy: false, note: 'SYNTHETIC TEST PRICES ONLY',
      accountKind: 'demo', server: 'Fixture only', bid: close, ask: close + .001,
      quoteTime: new Date(now).toISOString(), capturedAt: new Date(now).toISOString(), validUntil: new Date(now + 180_000).toISOString() } };
  const row = analyzeAdvancedSignal(meta, horizon, frames, now);
  if (window.fixture.state === 'stale') { row.status = 'stale'; row.expiresAt = new Date(now - 1).toISOString(); }
  return new Response(JSON.stringify({ generatedAt: new Date(now).toISOString(), data: [row], universe: [meta],
    scope: { market: url.searchParams.get('market'), source: url.searchParams.get('source'), horizon,
      page: Number(url.searchParams.get('page')), pages: 1, total: 1, symbol: url.searchParams.get('symbol') } }), { status: 200 });
};
createRoot(document.getElementById('root')).render(<Page />);
