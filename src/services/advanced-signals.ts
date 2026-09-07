import { FOREX_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/constants';
import { aggregateCompleteFourHours, analyzeAdvancedSignal, type AdvancedSignal, type SignalHorizon, type FrameInput } from '@/lib/analysis/advanced-signals';
import { fetchYahooSignalCandles, mapSymbolToYahoo } from '@/services/api/yahoo-finance';
import type { OHLCV } from '@/types/market';

export type SignalMarket = 'all' | 'forex' | 'crypto';
export interface SignalAsset { symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto' }
export const SIGNAL_PAGE_SIZE = 6;
export const ADVANCED_UNIVERSE: SignalAsset[] = (() => {
  const forex = FOREX_SYMBOLS.map(row => ({ ...row, displaySymbol: row.symbol, marketType: 'forex' as const }));
  const crypto = CRYPTO_SYMBOLS.map(row => ({ ...row, displaySymbol: row.symbol.replace('/USDT', '/USD'), marketType: 'crypto' as const }));
  const priority = ['XAU/USD', 'BTC/USDT', 'EUR/USD', 'ETH/USDT', 'GBP/USD', 'SOL/USDT'];
  const all = [...forex, ...crypto];
  return [...priority.map(symbol => all.find(row => row.symbol === symbol)!), ...all.filter(row => !priority.includes(row.symbol))];
})();

export function resolveSignalSymbol(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/[/-]/g, '');
  return ADVANCED_UNIVERSE.find(row => row.symbol.replace('/', '') === compact || row.displaySymbol.replace('/', '') === compact)?.symbol ?? null;
}

export function selectSignalUniverse(market: SignalMarket, page: number, symbol: string | null = null) {
  const assets = ADVANCED_UNIVERSE.filter(row => market === 'all' || row.marketType === market);
  const selected = symbol ? assets.filter(row => row.symbol === symbol) : assets.slice(page * SIGNAL_PAGE_SIZE, (page + 1) * SIGNAL_PAGE_SIZE);
  return { selected, total: assets.length, pages: Math.ceil(assets.length / SIGNAL_PAGE_SIZE) };
}

type FeedTimeframe = '15m' | '1H' | '1D';
type FeedResult = { candles: OHLCV[]; error?: string };
// Bounded per-process cache and in-flight coalescing. Analysis is recomputed
// with a fresh clock on every request, so caching never renews candle expiry.
const cache = new Map<string, { expires: number; result: FeedResult }>();
const pending = new Map<string, Promise<FeedResult>>();
let activeFeeds = 0;
const waiters: Array<() => void> = [];
async function limitedFeed<T>(work: () => Promise<T>): Promise<T> {
  if (activeFeeds >= 4) {
    if (waiters.length >= 12) throw new Error('Feed capacity reached');
    await new Promise<void>((resolve, reject) => {
      const resume = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiters.indexOf(resume);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error('Feed wait deadline exceeded'));
      }, 20_000);
      waiters.push(resume);
    });
  } else activeFeeds++;
  try { return await work(); }
  finally { const next = waiters.shift(); if (next) next(); else activeFeeds--; }
}

async function feed(asset: SignalAsset, timeframe: FeedTimeframe): Promise<FeedResult> {
  const key = `${asset.symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  if (pending.has(key)) return pending.get(key)!;
  const work = limitedFeed(async () => {
    let result: FeedResult;
    try {
      const candles = await fetchYahooSignalCandles(asset.symbol, asset.marketType, timeframe);
      result = candles.length ? { candles } : { candles: [], error: 'Provider belum mengirim candle; bukan sinyal netral.' };
    } catch { result = { candles: [], error: 'Data provider gagal dimuat; coba muat ulang.' }; }
    if (cache.size >= 48) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + (result.error ? 10_000 : 60_000) });
    return result;
  }).catch(() => ({ candles: [], error: 'Provider sedang sibuk; coba lagi.' }));
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

export async function scanAdvancedSignals(assets: SignalAsset[], horizon: SignalHorizon): Promise<AdvancedSignal[]> {
  return Promise.all(assets.map(async asset => {
    const [hourly, other] = await Promise.all([feed(asset, '1H'), feed(asset, horizon === 'intraday' ? '15m' : '1D')]);
    const h1: FrameInput = { timeframe: '1H', ...hourly };
    const h4: FrameInput = { timeframe: '4H', candles: aggregateCompleteFourHours(hourly.candles), error: hourly.error };
    const frames: FrameInput[] = horizon === 'intraday' ? [{ timeframe: '15m', ...other }, h1, h4] : [h1, h4, { timeframe: '1D', ...other }];
    const instrument = mapSymbolToYahoo(asset.symbol, asset.marketType);
    const metal = asset.symbol === 'XAU/USD' || asset.symbol === 'XAG/USD';
    return analyzeAdvancedSignal({ ...asset, source: { provider: 'Yahoo Finance', instrument,
      isProxy: metal || asset.marketType === 'crypto',
      note: metal ? `${instrument} adalah proxy futures, bukan spot ${asset.symbol} MT5. Jangan salin level langsung ke broker.`
        : asset.marketType === 'crypto' ? `${instrument} memakai kuotasi USD; bukan USDT Binance atau CFD MT5.`
          : `${instrument} adalah feed referensi, bukan bid/ask broker MT5.` } }, horizon, frames);
  }));
}
