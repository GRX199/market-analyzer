import React from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname } from 'next/navigation';
import { useUserStore } from '../../src/stores/user-store';
import { useMarketStore } from '../../src/stores/market-store';
import { analyzeAdvancedSignal, FRAME_SECONDS } from '../../src/lib/analysis/advanced-signals';
import { FOREX_SYMBOLS, CRYPTO_SYMBOLS } from '../../src/lib/constants';
import Dashboard from '../../src/app/dashboard/page';
import Signals from '../../src/app/signals/page';
import Market from '../../src/app/market/page';
import Login from '../../src/app/login/page';
import Operations from '../../src/app/operations/page';
import Watchlist from '../../src/app/watchlist/page';
import Journal from '../../src/app/journal/page';
import Portfolio from '../../src/app/portfolio/page';
import Alerts from '../../src/app/alerts/page';
import News from '../../src/app/news/page';
import ForexNews from '../../src/app/forex-news/page';
import ForexRobot from '../../src/app/forex-robot/page';
import CryptoRobot from '../../src/app/scalping/page';
import Intelligence from '../../src/app/trade-intelligence/page';
import Backtest from '../../src/app/backtest/page';
import Compare from '../../src/app/compare/page';
import Screener from '../../src/app/screener/page';
import Calendar from '../../src/app/calendar/page';
import Settings from '../../src/app/settings/page';
import Disclaimer from '../../src/app/disclaimer/page';
import AssetClientPage from '../../src/app/asset/[symbol]/asset-client';
import { DashboardLayout } from '../../src/components/layout/dashboard-layout';

function AssetDetail() { return <DashboardLayout><AssetClientPage symbol="XAU/USD" /></DashboardLayout>; }

const pages = { '/dashboard': Dashboard, '/signals': Signals, '/market': Market, '/login': Login,
  '/operations': Operations, '/watchlist': Watchlist, '/journal': Journal, '/portfolio': Portfolio,
  '/alerts': Alerts, '/news': News, '/forex-news': ForexNews, '/forex-robot': ForexRobot,
  '/scalping': CryptoRobot, '/trade-intelligence': Intelligence, '/backtest': Backtest,
  '/compare': Compare, '/screener': Screener, '/calendar': Calendar, '/settings': Settings, '/disclaimer': Disclaimer, '/asset/XAU%2FUSD': AssetDetail };
const universe = [...FOREX_SYMBOLS.map(asset => ({ ...asset, displaySymbol: asset.symbol, marketType: 'forex' })),
  ...CRYPTO_SYMBOLS.map(asset => ({ ...asset, displaySymbol: asset.symbol, marketType: 'crypto' }))];
const assets = [universe.find(a => a.symbol === 'XAU/USD'), universe.find(a => a.symbol === 'BTC/USDT'),
  universe.find(a => a.symbol === 'EUR/USD'), universe.find(a => a.symbol === 'ETH/USDT'), universe.find(a => a.symbol === 'GBP/USD'), universe.find(a => a.symbol === 'SOL/USDT')]
  .map((asset, i) => ({ ...asset, price: [2500.42, 62380.25, 1.10645, 3240.75, 1.3012, 158.4][i],
    change: i % 2 ? -2 : 4, changePercent: i % 2 ? -1.42 : 2.16, volume: 1234000, marketCap: null,
    trend: i % 2 ? 'bearish' : 'bullish', marketState: 'REGULAR', lastUpdated: new Date().toISOString(), technicalScore: 62, signal: 'buy' }));
window.fixture = { requests: [], writes: [], marketError: false, assetError: false, ready: false, pages: Object.keys(pages) };
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (options.method && options.method !== 'GET') { window.fixture.writes.push(String(input)); throw new Error('Mutations forbidden in workspace fixture'); }
  window.fixture.requests.push(url.pathname);
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
  if (url.pathname === '/api/market') {
    if (window.fixture.marketError) return response({ error: 'Synthetic provider unavailable' }, 503);
    const type = url.searchParams.get('type');
    return response({ success: true, data: assets.filter(asset => !type || type === 'all' || asset.marketType === type) });
  }
  if (url.pathname === '/api/signals') return response({ success: true, data: [] });
  if (url.pathname === '/api/trades') return response({ success: true, trades: [], data: [] });
  if (url.pathname === '/api/market/XAU-USD') {
    if (window.fixture.assetError) return response({ success: false }, 503);
    return response({ success: true, data: { asset: assets[0], chart: Array.from({ length: 100 }, (_, i) => ({ time: 1700000000 + i * 86400, open: 2400 + i, close: 2401 + i, high: 2402 + i, low: 2399 + i, volume: 100 })) } });
  }
  if (url.pathname === '/api/analysis/XAU-USD') return response({ success: true, data: {
    symbol: 'XAU/USD', marketType: 'forex', technical: { score: 50 }, fundamental: { score: 50 }, sentiment: { score: 50 },
    finalScore: 50, signal: 'hold', confidence: 50, riskLevel: 'medium', trend: 'sideways',
    reasons: ['DATA SIMULASI UNTUK UJI TAMPILAN'], buyFactors: [], sellFactors: [], riskFactors: [],
    supportLevel: 2400, resistanceLevel: 2600, stopLoss: 2390, takeProfit: 2600, timestamp: new Date().toISOString(),
  } });
  if (url.pathname === '/api/signals/advanced') {
    const now = Date.now(), horizon = url.searchParams.get('horizon');
    const frames = (horizon === 'swing' ? ['1H', '4H', '1D'] : ['15m', '1H', '4H']).map(timeframe => {
      const seconds = FRAME_SECONDS[timeframe], end = Math.floor(now / 1000 / seconds) * seconds;
      const candles = Array.from({ length: 400 }, (_, i) => {
        const close = 100 + i * .03 + Math.sin((i + 5) * .35) * .5;
        return { time: end - (400 - i) * seconds, open: close - .05, high: close + .2, low: close - .2, close, volume: 100 };
      });
      candles.at(-1).close += .65; candles.at(-1).high = candles.at(-1).close + .05;
      return { timeframe, candles, session: 'continuous' };
    });
    const close = frames[0].candles.at(-1).close;
    const chosen = url.searchParams.get('symbol');
    const rows = (chosen ? universe.filter(asset => asset.symbol === chosen) : assets).map(asset => analyzeAdvancedSignal({ ...asset,
      source: { kind: 'broker', provider: 'MT5 fixture', instrument: asset.symbol.replace('/USDT', 'USD').replace('/', '') + 'm',
        isProxy: false, note: 'DATA SIMULASI UNTUK UJI TAMPILAN', accountKind: 'demo', server: 'Fixture server',
        bid: close, ask: close + .001, quoteTime: new Date(now).toISOString(), capturedAt: new Date(now).toISOString(), validUntil: new Date(now + 180000).toISOString() } }, horizon, frames, now));
    return response({ generatedAt: new Date(now).toISOString(), data: rows, universe,
      scope: { market: url.searchParams.get('market'), source: url.searchParams.get('source'), horizon,
        page: Number(url.searchParams.get('page')), pages: 1, total: rows.length, symbol: chosen } });
  }
  return response({ success: false, error: 'Data simulasi belum tersedia. Gunakan tombol muat ulang.' }, 503);
};
await Promise.all([useUserStore.persist.rehydrate(), useMarketStore.persist.rehydrate()]);
useUserStore.setState({ user: { id: 'fixture-owner', email: 'test@example.invalid', displayName: 'Pengguna Demo' },
  authenticatedUserId: 'fixture-owner', isAuthenticated: true, isAccountLoading: false, accountLoadError: null,
  disclaimerAccepted: true, disclaimerAcceptedUserId: 'fixture-owner', theme: new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light',
  syncWatchlistToSupabase: async () => {}, sidebarCollapsed: false });
useMarketStore.setState({ selectedMarket: 'all' });
function App() {
  const pathname = usePathname(), Page = pages[pathname] ?? Dashboard;
  return <Page key={pathname} />;
}
createRoot(document.getElementById('root')).render(<App />);
window.fixture.ready = true;
