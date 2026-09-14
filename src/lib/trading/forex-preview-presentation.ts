export type ForexPreviewSignal = 'buy' | 'sell' | 'wait' | 'unavailable' | 'stale';
export type ForexStrategyMode = 'stable_h1' | 'aggressive_m15';
export interface ForexPreviewRow {
  symbol: string;
  name: string;
  signal: ForexPreviewSignal;
  trend?: 'bullish' | 'bearish' | 'neutral';
  price?: number;
  ema50?: number;
  ema200?: number;
  emaSeparationAtr?: number;
  breakoutHigh?: number;
  breakoutLow?: number;
  rsi?: number;
  previousRsi?: number;
  atr?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  candleOpenedAt?: string;
  lastClosedAt?: string;
  expiresAt?: string;
  reason: string;
}
export interface ForexPreview {
  scannedAt: string;
  strategyMode: ForexStrategyMode;
  timeframe: '1H' | '15m';
  source: string;
  sourceInstrument: 'GC=F';
  isProxy: true;
  rows: ForexPreviewRow[];
}

const SCAN_LIFETIME_MS = 5 * 60_000;
const ENTRY_WINDOW_MS = 120_000;
function isoTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(time) && new Date(time).toISOString() === normalized ? time : NaN;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** lastClosedAt is the actual close time, not the provider's candle-open timestamp. */
export function forexPreviewExpiry(timeframe: '1H' | '15m', scannedAt: string, lastClosedAt: string, signal: ForexPreviewSignal): number {
  const scanned = isoTime(scannedAt), closed = isoTime(lastClosedAt);
  if (!Number.isFinite(scanned) || !Number.isFinite(closed) || closed > scanned) return NaN;
  const candleMs = timeframe === '1H' ? 3_600_000 : 900_000;
  // A WAIT can be monitored until the next close (+ provider grace). A candidate cannot be chased later.
  return Math.min(scanned + SCAN_LIFETIME_MS, closed + (signal === 'buy' || signal === 'sell' ? ENTRY_WINDOW_MS : candleMs + 90_000));
}

/** No coercion of booleans/strings into price levels; reject inconsistent payloads as a whole. */
export function parseForexPreview(value: unknown): ForexPreview | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  if (root.success !== true || !root.data || typeof root.data !== 'object') return null;
  const data = root.data as Record<string, unknown>;
  if (!Number.isFinite(isoTime(data.scannedAt)) || data.sourceInstrument !== 'GC=F' || data.isProxy !== true
    || typeof data.source !== 'string' || !Array.isArray(data.rows) || data.rows.length !== 1
    || !((data.strategyMode === 'stable_h1' && data.timeframe === '1H')
      || (data.strategyMode === 'aggressive_m15' && data.timeframe === '15m'))) return null;
  const rows: ForexPreviewRow[] = [];
  for (const candidate of data.rows) {
    if (!candidate || typeof candidate !== 'object') return null;
    const row = candidate as Record<string, unknown>;
    if (row.symbol !== 'XAU/USD' || typeof row.name !== 'string' || typeof row.reason !== 'string'
      || !['buy', 'sell', 'wait', 'unavailable', 'stale'].includes(String(row.signal))) return null;
    const result: ForexPreviewRow = { symbol: row.symbol, name: row.name, reason: row.reason, signal: row.signal as ForexPreviewSignal };
    if (['bullish', 'bearish', 'neutral'].includes(String(row.trend))) result.trend = row.trend as ForexPreviewRow['trend'];
    for (const key of ['price', 'ema50', 'ema200', 'emaSeparationAtr', 'breakoutHigh', 'breakoutLow', 'rsi', 'previousRsi', 'atr', 'stopLoss', 'takeProfit'] as const) {
      if (row[key] === undefined || row[key] === null) continue;
      if (!finite(row[key])) return null;
      result[key] = row[key];
    }
    for (const key of ['candleOpenedAt', 'lastClosedAt', 'expiresAt'] as const) {
      if (row[key] === undefined) continue;
      if (!Number.isFinite(isoTime(row[key]))) return null;
      result[key] = row[key] as string;
    }
    if (result.signal === 'buy' || result.signal === 'sell' || result.signal === 'wait') {
      const expiry = forexPreviewExpiry(data.timeframe, data.scannedAt as string, result.lastClosedAt ?? '', result.signal);
      const duration = data.timeframe === '1H' ? 3_600_000 : 900_000;
      if (!finite(result.price) || result.price <= 0 || !Number.isFinite(expiry)
        || isoTime(result.lastClosedAt) - isoTime(result.candleOpenedAt) !== duration
        || !Number.isFinite(isoTime(result.expiresAt)) || isoTime(result.expiresAt) > expiry) return null;
      if (result.signal !== 'wait') {
        const direction = result.signal === 'buy' ? 1 : -1;
        if (!finite(result.stopLoss) || !finite(result.takeProfit) || result.stopLoss <= 0 || result.takeProfit <= 0
          || direction * (result.price - result.stopLoss) <= 0 || direction * (result.takeProfit - result.price) <= 0) return null;
      }
    }
    // WAIT, invalid and stale responses never carry actionable levels.
    if (result.signal !== 'buy' && result.signal !== 'sell') {
      result.stopLoss = null; result.takeProfit = null;
    }
    rows.push(result);
  }
  return { scannedAt: data.scannedAt as string, strategyMode: data.strategyMode, timeframe: data.timeframe,
    source: data.source, sourceInstrument: 'GC=F', isProxy: true, rows };
}

export function presentForexPreview(preview: ForexPreview, now: number): ForexPreviewRow[] {
  return preview.rows.map(row => {
    if (row.signal === 'unavailable' || row.signal === 'stale') return { ...row, stopLoss: null, takeProfit: null };
    const expiry = Math.min(isoTime(row.expiresAt), forexPreviewExpiry(preview.timeframe, preview.scannedAt, row.lastClosedAt ?? '', row.signal));
    if (!Number.isFinite(now) || !Number.isFinite(expiry) || now < isoTime(preview.scannedAt) || now >= expiry) {
      return { ...row, signal: 'stale', stopLoss: null, takeProfit: null,
        reason: 'Preview kedaluwarsa atau waktu data invalid. Level disembunyikan; muat ulang dan tunggu setup baru. Ini bukan status proses robot.' };
    }
    return row;
  });
}
