import type { FrameInput } from './advanced-signals';

export interface BrokerSnapshot {
  symbol: string; instrument: string; broker: string; server: string; accountKind: 'demo' | 'real';
  accountRef: string; capturedAt: string; quoteTime: string; bid: number; ask: number;
  frames: FrameInput[];
}
const text = (v: unknown, max = 100): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const seconds = { '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 } as const;
const iso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(v);

/** Whitelist fields; account IDs, balances, passwords and owner IDs never pass through. */
export function parseBrokerSnapshot(value: unknown, now = Date.now(), requireRecent = true): BrokerSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Snapshot MT5 tidak valid.');
  const v = value as Record<string, unknown>;
  if (!text(v.symbol, 24) || !/^[A-Z0-9]{2,12}\/[A-Z]{3,4}$/.test(v.symbol)
    || !text(v.instrument, 32) || !/^[A-Za-z0-9._#-]+$/.test(v.instrument)
    || !text(v.broker) || !text(v.server) || !['demo', 'real'].includes(String(v.accountKind))
    || !text(v.accountRef, 24) || !/^[a-f0-9]{24}$/.test(v.accountRef)
    || !iso(v.capturedAt) || !iso(v.quoteTime) || !positive(v.bid) || !positive(v.ask) || v.ask < v.bid) throw new Error('Identitas/quote MT5 tidak valid.');
  const symbolBase = String(v.symbol).replace('/', '');
  if (!String(v.instrument).toUpperCase().startsWith(symbolBase)) throw new Error('Instrumen MT5 tidak cocok dengan simbol snapshot.');
  const captured = Date.parse(v.capturedAt), quote = Date.parse(v.quoteTime);
  if (!Number.isFinite(captured) || !Number.isFinite(quote) || captured > now + 30_000 || quote > captured + 30_000
    || quote > now + 30_000 || (requireRecent && (now - captured > 180_000 || now - quote > 180_000))) throw new Error('Sinkronisasi/quote MT5 kedaluwarsa; jalankan pengirim data dan periksa koneksi terminal.');
  if (!Array.isArray(v.frames) || v.frames.length !== 4) throw new Error('Empat timeframe MT5 diperlukan.');
  const seen = new Set<string>();
  const frames: FrameInput[] = v.frames.map(raw => {
    const frameValue = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    if (!raw || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(seconds, frameValue.timeframe as PropertyKey) || seen.has(String(frameValue.timeframe))
      || !Array.isArray(raw.candles) || raw.candles.length < 250 || raw.candles.length > 400) throw new Error('Pemanasan MT5 belum cukup: 250–400 candle final per timeframe diperlukan.');
    const timeframe = raw.timeframe as keyof typeof seconds; seen.add(timeframe);
    let prior = 0;
    const candles = raw.candles.map((r: Record<string, unknown>) => {
      if (!r || !positive(r.time) || !Number.isInteger(r.time) || r.time <= prior || r.time * 1000 + seconds[timeframe] * 1000 > captured
        || !positive(r.open) || !positive(r.high) || !positive(r.low) || !positive(r.close)
        || r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close)
        || typeof r.volume !== 'number' || !Number.isFinite(r.volume) || r.volume < 0) throw new Error('Candle MT5 invalid, duplikat, tidak berurutan, atau belum final.');
      prior = r.time;
      return { time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume };
    });
    return { timeframe, candles };
  });
  return { symbol: v.symbol, instrument: v.instrument, broker: v.broker, server: v.server,
    accountKind: v.accountKind as 'demo' | 'real', accountRef: v.accountRef, capturedAt: v.capturedAt,
    quoteTime: v.quoteTime, bid: v.bid, ask: v.ask, frames };
}
