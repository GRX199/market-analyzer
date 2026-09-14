import { FOREX_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/constants';
import { aggregateCompleteFourHours, analyzeAdvancedSignal, HORIZON_FRAMES, type AdvancedSignal, type SignalHorizon, type FrameInput, type SignalSession } from '@/lib/analysis/advanced-signals';
import { fetchYahooSignalCandles, mapSymbolToYahoo } from '@/services/api/yahoo-finance';
import { parseBrokerSnapshot, type BrokerSnapshot } from '@/lib/analysis/broker-snapshot';
import { fetchBinanceSignalCandles } from '@/services/api/binance-signals';
import type { OHLCV } from '@/types/market';

export type SignalMarket = 'all' | 'forex' | 'crypto';
export type SignalSource = 'market' | 'mt5' | 'reference';
export interface SignalAsset { symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto' }
export const SIGNAL_PAGE_SIZE = 6;
export const ADVANCED_UNIVERSE: SignalAsset[] = (() => {
  const forex = FOREX_SYMBOLS.map(row => ({ ...row, displaySymbol: row.symbol, marketType: 'forex' as const }));
  const crypto = CRYPTO_SYMBOLS.map(row => ({ ...row, displaySymbol: row.symbol, marketType: 'crypto' as const }));
  const priority = ['XAU/USD', 'BTC/USDT', 'EUR/USD', 'ETH/USDT', 'GBP/USD', 'SOL/USDT'];
  const all = [...forex, ...crypto];
  return [...priority.map(symbol => all.find(row => row.symbol === symbol)!), ...all.filter(row => !priority.includes(row.symbol))];
})();

export function resolveSignalSymbol(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/[/-]/g, '');
  return ADVANCED_UNIVERSE.find(row => row.symbol.replace('/', '') === compact || row.symbol.replace('/USDT', '/USD').replace('/', '') === compact)?.symbol ?? null;
}

export function selectSignalUniverse(market: SignalMarket, page: number, symbol: string | null = null) {
  const assets = ADVANCED_UNIVERSE.filter(row => market === 'all' || row.marketType === market);
  const selected = symbol ? assets.filter(row => row.symbol === symbol) : assets.slice(page * SIGNAL_PAGE_SIZE, (page + 1) * SIGNAL_PAGE_SIZE);
  return { selected, total: assets.length, pages: Math.ceil(assets.length / SIGNAL_PAGE_SIZE) };
}

type FeedTimeframe = '15m' | '1H' | '4H' | '1D';
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

async function feed(asset: SignalAsset, timeframe: FeedTimeframe, source: 'market' | 'reference'): Promise<FeedResult> {
  if (source === 'market' && asset.marketType !== 'crypto') return { candles: [], error: 'Snapshot MT5 belum tersedia.' };
  const key = `${source}:${asset.symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  if (pending.has(key)) return pending.get(key)!;
  const work = limitedFeed(async () => {
    let result: FeedResult;
    try {
      const candles = source === 'market' && asset.marketType === 'crypto'
        ? await fetchBinanceSignalCandles(asset.symbol, timeframe)
        : await fetchYahooSignalCandles(asset.symbol, asset.marketType, timeframe === '4H' ? '1H' : timeframe);
      result = candles.length ? { candles } : { candles: [], error: 'Provider belum mengirim candle; bukan sinyal netral.' };
    } catch (error) { result = { candles: [], error: source === 'market' && error instanceof Error ? error.message : 'Data provider gagal dimuat; coba muat ulang.' }; }
    if (cache.size >= 48) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + (result.error ? 10_000 : 60_000) });
    return result;
  }).catch(() => ({ candles: [], error: 'Provider sedang sibuk; coba lagi.' }));
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

export async function scanAdvancedSignals(assets: SignalAsset[], horizon: SignalHorizon, options: { source?: SignalSource; brokerSnapshots?: Record<string, unknown>; brokerError?: string } = {}): Promise<AdvancedSignal[]> {
  const source = options.source ?? 'market';
  return Promise.all(assets.map(async asset => {
    const metal = ['XAU/USD', 'XAG/USD'].includes(asset.symbol);
    if (source === 'mt5' || source === 'market' && asset.marketType === 'forex') {
      const now = Date.now();
      let broker: BrokerSnapshot | undefined, error = options.brokerError;
      try {
        const raw = options.brokerSnapshots?.[asset.symbol];
        if (raw) {
          broker = parseBrokerSnapshot(raw, now, false);
          if (broker.symbol !== asset.symbol) { broker = undefined; throw new Error('Simbol snapshot tidak cocok dengan permintaan.'); }
        } else error ??= 'Bridge MT5 belum mengirim simbol ini. Jalankan run_signal_bridge.bat; histori tidak diganti Yahoo.';
      } catch (cause) { error = cause instanceof Error ? cause.message : 'Snapshot MT5 invalid.'; }
      const exness = broker && /^Exness\b/i.test(broker.broker) && /^Exness-MT5/i.test(broker.server);
      const session: SignalSession = exness && asset.marketType === 'forex' ? metal ? 'exness-metals' : 'exness-forex' : 'continuous';
      const validUntil = broker ? new Date(Math.min(Date.parse(broker.capturedAt), Date.parse(broker.quoteTime)) + 180_000).toISOString() : undefined;
      const frames: FrameInput[] = HORIZON_FRAMES[horizon].map(timeframe => ({ timeframe, session,
        candles: broker?.frames.find(frame => frame.timeframe === timeframe)?.candles ?? [], error }));
      const row = analyzeAdvancedSignal({ ...asset, displaySymbol: asset.symbol.replace('/USDT', '/USD'), source: {
        provider: 'MT5 Broker', kind: 'broker', instrument: broker?.instrument ?? asset.symbol.replace('/USDT', 'USD').replace('/', ''), isProxy: false,
        note: broker ? `${broker.instrument} · CFD broker ${broker.broker}; candle native dan quote akun ${broker.accountKind}. Bukan futures/spot exchange.` : error!,
        ...(broker && { accountKind: broker.accountKind, server: broker.server, capturedAt: broker.capturedAt, quoteTime: broker.quoteTime, bid: broker.bid, ask: broker.ask, validUntil }),
      } }, horizon, frames, now);
      if (validUntil) {
        row.expiresAt = new Date(Math.min(Date.parse(validUntil), row.expiresAt ? Date.parse(row.expiresAt) : Infinity)).toISOString();
        if (now >= Date.parse(validUntil)) {
          row.status = 'stale'; row.plan = null; row.manualScenarios = []; row.conviction = null;
          row.reasons = ['Quote/snapshot MT5 melewati 3 menit. Periksa bridge, koneksi terminal, dan sesi pasar.', ...row.reasons];
        }
      }
      return row;
    }
    const [hourly, other, nativeH4] = await Promise.all([
      feed(asset, '1H', source),
      feed(asset, horizon === 'intraday' ? '15m' : '1D', source),
      source === 'market' ? feed(asset, '4H', source) : Promise.resolve<FeedResult>({ candles: [] }),
    ]);
    const h1: FrameInput = { timeframe: '1H', ...hourly };
    const h4: FrameInput = source === 'market' ? { timeframe: '4H', ...nativeH4 } : { timeframe: '4H', candles: aggregateCompleteFourHours(hourly.candles), error: hourly.error };
    const frames: FrameInput[] = horizon === 'intraday' ? [{ timeframe: '15m', ...other }, h1, h4] : [h1, h4, { timeframe: '1D', ...other }];
    const instrument = source === 'market' ? asset.symbol.replace('/', '') : mapSymbolToYahoo(asset.symbol, asset.marketType);
    return analyzeAdvancedSignal({ ...asset, displaySymbol: source === 'market' ? asset.symbol : asset.symbol.replace('/USDT', '/USD'), source: { provider: source === 'market' ? 'Binance Spot' : 'Yahoo Finance', instrument,
      kind: source === 'market' ? 'spot' : 'reference', isProxy: source === 'reference',
      note: metal ? `${instrument} adalah proxy futures, bukan spot ${asset.symbol} MT5. Jangan salin level langsung ke broker.`
        : asset.marketType === 'crypto' && source === 'market' ? `${instrument} adalah candle Binance Spot USDT; cocokkan harga dengan broker sebelum entry.`
          : asset.marketType === 'crypto' ? `${instrument} memakai kuotasi USD referensi; bukan USDT Binance atau CFD MT5.`
          : `${instrument} adalah feed referensi, bukan bid/ask broker MT5.` } }, horizon, frames);
  }));
}
