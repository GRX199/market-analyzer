import type { OHLCV } from '@/types/market';

export type BinanceSignalFrame = '15m' | '1H' | '4H' | '1D';
const INTERVAL = { '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d' } as const;

/** Public spot data only. Never silently substitutes USD for USDT. */
export function parseSignalKlines(payload: unknown): OHLCV[] {
  if (!Array.isArray(payload) || payload.length > 400) throw new Error('Format candle Binance tidak valid.');
  return payload.map(row => {
    if (!Array.isArray(row) || row.length < 7) throw new Error('Candle Binance tidak lengkap.');
    const values = row.slice(0, 6).map(value => typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN);
    const [time, open, high, low, close, volume] = values;
    if (!values.every(Number.isFinite) || time <= 0 || Math.min(open, high, low, close) <= 0 || volume < 0
      || high < Math.max(open, close) || low > Math.min(open, close)) throw new Error('OHLC Binance invalid.');
    return { time: time / 1000, open, high, low, close, volume };
  });
}

export async function fetchBinanceSignalCandles(symbol: string, timeframe: BinanceSignalFrame): Promise<OHLCV[]> {
  if (!/^[A-Z0-9]{2,12}\/USDT$/.test(symbol)) throw new Error('Pair Binance USDT tidak valid.');
  const query = new URLSearchParams({ symbol: symbol.replace('/', ''), interval: INTERVAL[timeframe], limit: '320' });
  const response = await fetch(`https://data-api.binance.vision/api/v3/klines?${query}`, {
    cache: 'no-store', signal: AbortSignal.timeout(12_000), redirect: 'error',
  });
  if (!response.ok) throw new Error(response.status === 400 ? 'Pair belum tersedia di Binance spot.' : `Feed Binance belum tersedia (HTTP ${response.status}).`);
  return parseSignalKlines(await response.json());
}
