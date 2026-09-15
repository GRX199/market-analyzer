import type { OHLCV } from '@/types/market';

export type SignalHorizon = 'intraday' | 'swing';
export type AnalysisTimeframe = '15m' | '1H' | '4H' | '1D';
export type SignalBias = 'bullish' | 'bearish' | 'neutral';
export type SetupStatus = 'candidate' | 'wait' | 'conflict' | 'stale' | 'unavailable';
export const SIGNAL_MODEL_VERSION = 'confluence-v4-structure-retest';
export const HORIZON_FRAMES: Record<SignalHorizon, AnalysisTimeframe[]> = {
  intraday: ['15m', '1H', '4H'], swing: ['1H', '4H', '1D'],
};
export const FRAME_SECONDS: Record<AnalysisTimeframe, number> = { '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };

export type SignalSession = 'continuous' | 'forex' | 'metal-futures' | 'exness-metals' | 'exness-forex';
export interface FrameInput { timeframe: AnalysisTimeframe; candles: OHLCV[]; error?: string; session?: SignalSession }
export interface ConfirmedLevel { price: number; kind: 'high' | 'low'; confirmedAt: string }
export interface FrameAnalysis {
  timeframe: AnalysisTimeframe; quality: 'fresh' | 'stale' | 'unavailable';
  lastClosedAt: string | null; expiresAt: string | null; bars: number; excluded: number;
  bias: SignalBias; regime: 'trend' | 'range' | 'transition' | 'unknown';
  close: number | null; ema20: number | null; ema50: number | null; ema200: number | null;
  rsi: number | null; previousRsi: number | null; atr: number | null; atrPercent: number | null;
  adx: number | null; plusDI: number | null; minusDI: number | null;
  support: number | null; resistance: number | null; channelHigh: number | null; channelLow: number | null;
  trigger: 'breakout' | 'retest' | 'recovery' | null; extensionAtr: number | null; rangeAtr: number | null;
  structureLevels?: ConfirmedLevel[]; triggerLevel?: number | null; triggerStop?: number | null;
  bodyFraction?: number | null; directionalClose?: number | null; triggerNotes?: string[];
  relativeVolume: number | null; notes: string[];
}
export interface ReferencePlan {
  side: 'buy' | 'sell'; entry: number; stopLoss: number; takeProfit: number; secondTarget: number | null;
  grossRiskReward: number; stopDistanceAtr: number; obstacle: number | null; basis: string;
  obstacleTimeframe?: AnalysisTimeframe | null;
}
export interface ManualScenario extends ReferencePlan {
  kind: 'conditional-breakout'; triggerPrice: number; distanceAtr: number;
  confirmation: string; invalidation: string;
}
export interface AdvancedSignal {
  id: string; symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto';
  source: { provider: string; instrument: string; isProxy: boolean; note: string;
    kind?: 'broker' | 'spot' | 'reference'; accountKind?: 'demo' | 'real'; server?: string;
    capturedAt?: string; quoteTime?: string; bid?: number; ask?: number; validUntil?: string };
  horizon: SignalHorizon; modelVersion: string; generatedAt: string; expiresAt: string | null;
  bias: SignalBias; status: SetupStatus; conviction: number | null; setup: string;
  frames: FrameAnalysis[]; reasons: string[]; cautions: string[]; plan: ReferencePlan | null;
  manualScenarios: ManualScenario[];
  groups: { label: string; points: number; maximum: number; detail: string }[];
}

type Candle = Omit<OHLCV, 'time'> & { time: number };
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const validClock = (value: number) => Number.isFinite(value) && value > 0 && value <= 8.64e15;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
export function signalCandleTime(time: OHLCV['time']): number {
  return typeof time === 'number' ? (time > 1e12 ? time / 1000 : time) : Date.parse(time) / 1000;
}
function validCandle(candle: OHLCV): boolean {
  return [candle.open, candle.high, candle.low, candle.close].every(finitePositive)
    && candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close)
    && candle.high >= candle.low;
}

/** UTC 4H buckets require four unique, valid, contiguous H1 constituents. */
export function aggregateCompleteFourHours(candles: OHLCV[]): OHLCV[] {
  const groups = new Map<number, OHLCV[]>();
  for (const candle of candles) {
    const time = signalCandleTime(candle.time);
    if (!Number.isFinite(time)) continue;
    const key = Math.floor(time / 14400) * 14400;
    groups.set(key, [...(groups.get(key) ?? []), candle]);
  }
  return [...groups].sort(([a], [b]) => a - b).flatMap(([time, rows]) => {
    rows.sort((a, b) => signalCandleTime(a.time) - signalCandleTime(b.time));
    if (rows.length !== 4 || rows.some((row, i) => !validCandle(row) || signalCandleTime(row.time) !== time + i * 3600)) return [];
    return [{ time, open: rows[0].open, high: Math.max(...rows.map(r => r.high)), low: Math.min(...rows.map(r => r.low)),
      close: rows[3].close, volume: rows.every(r => Number.isFinite(r.volume) && r.volume >= 0) ? rows.reduce((n, r) => n + r.volume, 0) : 0 }];
  });
}

export function signalEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  let value = mean(values.slice(0, period));
  const result = Array<number>(period - 1).fill(NaN);
  result.push(value);
  for (let i = period; i < values.length; i++) { value += 2 / (period + 1) * (values[i] - value); result.push(value); }
  return result;
}

/** Wilder smoothing. Flat RSI=50, monotonic gains=100, losses=0. */
export function signalRSI(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { gain += Math.max(0, values[i] - values[i - 1]); loss += Math.max(0, values[i - 1] - values[i]); }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    gain = (gain * (period - 1) + Math.max(0, values[i] - values[i - 1])) / period;
    loss = (loss * (period - 1) + Math.max(0, values[i - 1] - values[i])) / period;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}

export function signalWilder(candles: OHLCV[], period = 14) {
  if (candles.length < period * 2) return null;
  let tr = 0, plus = 0, minus = 0;
  const dx: number[] = [];
  let plusDI = 0, minusDI = 0;
  for (let i = 1; i < candles.length; i++) {
    const row = candles[i], prev = candles[i - 1];
    const range = Math.max(row.high - row.low, Math.abs(row.high - prev.close), Math.abs(row.low - prev.close));
    const up = row.high - prev.high, down = prev.low - row.low;
    const p = up > down && up > 0 ? up : 0, m = down > up && down > 0 ? down : 0;
    if (i <= period) { tr += range; plus += p; minus += m; }
    else { tr = tr - tr / period + range; plus = plus - plus / period + p; minus = minus - minus / period + m; }
    if (i >= period) {
      plusDI = tr > 0 ? 100 * plus / tr : 0; minusDI = tr > 0 ? 100 * minus / tr : 0;
      dx.push(plusDI + minusDI > 0 ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0);
    }
  }
  let adx = mean(dx.slice(0, period));
  for (const value of dx.slice(period)) adx = (adx * (period - 1) + value) / period;
  return { atr: tr / period, adx, plusDI, minusDI };
}

function structure(candles: Candle[], entry: number, seconds: number) {
  const rows = candles.slice(-122), levels: ConfirmedLevel[] = [];
  // A pivot is usable only after its two right-hand confirmation bars closed.
  for (let i = 2; i < rows.length - 2; i++) {
    const neighbors = [rows[i - 2], rows[i - 1], rows[i + 1], rows[i + 2]];
    const confirmedAt = new Date((rows[i + 2].time + seconds) * 1000).toISOString();
    if (neighbors.every(row => rows[i].high > row.high)) levels.push({ price: rows[i].high, kind: 'high', confirmedAt });
    if (neighbors.every(row => rows[i].low < row.low)) levels.push({ price: rows[i].low, kind: 'low', confirmedAt });
  }
  return { structureLevels: levels,
    support: levels.map(level => level.price).filter(level => level < entry).sort((a, b) => b - a)[0] ?? null,
    resistance: levels.map(level => level.price).filter(level => level > entry).sort((a, b) => a - b)[0] ?? null };
}

/** Only closed rows supplied by analyzeSignalFrame; no forming/future data. */
function entryTrigger(rows: Candle[], frame: FrameAnalysis) {
  const last = rows.at(-1)!, previous = rows.at(-2)!, atr = frame.atr!;
  const buy = frame.bias === 'bullish', direction = buy ? 1 : -1;
  const range = last.high - last.low;
  frame.bodyFraction = range > 0 ? Math.abs(last.close - last.open) / range : 0;
  frame.directionalClose = frame.bias === 'neutral' ? null : range > 0 ? (buy ? last.close - last.low : last.high - last.close) / range : 0;
  frame.triggerNotes = []; frame.triggerLevel = null; frame.triggerStop = null;
  if (frame.bias === 'neutral') return;
  const strongCandle = direction * (last.close - last.open) > 0 && frame.bodyFraction >= .35 && frame.directionalClose! >= .65;
  const channel = buy ? frame.channelHigh! : frame.channelLow!;
  if (direction * (last.close - channel) > 0) {
    frame.triggerLevel = channel;
    if (strongCandle && direction * (last.close - channel) >= .1 * atr) {
      frame.trigger = 'breakout'; frame.triggerStop = buy ? Math.min(last.low, channel) : Math.max(last.high, channel);
    }
    else frame.triggerNotes.push('Breakout belum kuat: perlu close melewati buffer 0,1 ATR, body ≥35%, dan close di 35% ujung candle searah.');
    return;
  }
  // First retest only: an intervening touch, close back inside, or expired
  // breakout cannot repeatedly supply a new trigger on the same level.
  for (let i = rows.length - 2; i >= rows.length - 7; i--) {
    const row = rows[i], prior = rows.slice(i - 20, i);
    const level = buy ? Math.max(...prior.map(r => r.high)) : Math.min(...prior.map(r => r.low));
    const width = row.high - row.low;
    const closeLocation = width > 0 ? (buy ? row.close - row.low : row.high - row.close) / width : 0;
    if (width <= 0 || direction * (row.close - level) <= 0 || direction * (row.close - row.open) <= 0
      || Math.abs(row.close - row.open) / width < .35 || closeLocation < .65) continue;
    const breakoutAtr = signalWilder(rows.slice(0, i + 1))!.atr;
    if (direction * (row.close - level) < .1 * breakoutAtr) continue;
    const held = rows.slice(i + 1, -1).every(r => direction * (r.close - level) > 0
      && (buy ? r.low > level + .25 * atr : r.high < level - .25 * atr));
    const touched = buy ? last.low <= level + .25 * atr && last.low >= level - .25 * atr
      : last.high >= level - .25 * atr && last.high <= level + .25 * atr;
    if (!held || !touched || !strongCandle || direction * (last.close - level) < .1 * atr) continue;
    frame.trigger = 'retest'; frame.triggerLevel = level;
    frame.triggerStop = buy ? Math.min(last.low, level) : Math.max(last.high, level);
    frame.triggerNotes.push(`Retest pertama pada breakout ${rows.length - 1 - i} candle lalu; level bertahan pada candle final.`);
    return;
  }
  const closes = rows.map(row => row.close);
  const recovery = [1, 2, 3].some(offset => {
    const end = closes.length - offset + 1;
    const before = signalRSI(closes.slice(0, end - 1))!, after = signalRSI(closes.slice(0, end))!;
    return buy ? before <= 45 && after > 45 : before >= 55 && after < 55;
  });
  if (recovery) {
    const priceConfirmed = direction * (last.close - (buy ? previous.high : previous.low)) > 0
      && direction * (last.close - frame.ema20!) > 0;
    if (strongCandle && priceConfirmed) {
      frame.trigger = 'recovery'; frame.triggerLevel = buy ? previous.high : previous.low;
      frame.triggerStop = buy ? Math.min(...rows.slice(-4).map(r => r.low)) : Math.max(...rows.slice(-4).map(r => r.high));
    } else frame.triggerNotes.push('RSI pulih dalam 3 candle; tunggu candle searah menembus candle sebelumnya dan kembali melewati EMA20.');
  }
}

const sessionClocks = {
  forex: new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', timeZoneName: 'shortOffset', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }),
  'metal-futures': new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }),
};
function sessionParts(time: number, session: Exclude<SignalSession, 'continuous'>) {
  const parts = sessionClocks[session.startsWith('exness-') ? 'metal-futures' : session as keyof typeof sessionClocks].formatToParts(new Date(time * 1000));
  const offset = parts.find(part => part.type === 'timeZoneName')!.value.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
  const offsetSeconds = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2] ?? 0) * 3600 + Number(offset[3] ?? 0) * 60) : NaN;
  return { day: parts.find(part => part.type === 'weekday')!.value, hour: Number(parts.find(part => part.type === 'hour')!.value), offsetSeconds };
}

/** Limited regular-session heuristic, not a holiday calendar or broker availability check. */
function regularClosure(time: number, seconds: number, session: SignalSession): boolean {
  if (session === 'continuous') return false;
  if (session.startsWith('exness-')) {
    // Exness UTC native bars: a missing bucket is explained only if ALL of it
    // is closed. Never apply Yahoo's partial-H4 aggregation rule to MT5 bars.
    const step = Math.min(seconds, 900);
    for (let offset = 0; offset < seconds; offset += step) {
      const instant = time + offset;
      // Official Exness Labor Day schedule: no quotes 18:28–22:01:30 UTC.
      // Quote/close-only reopening is NOT a licence to execute new orders.
      if (session === 'exness-metals' && instant >= Date.parse('2026-09-07T18:28:00Z') / 1000
        && instant + step <= Date.parse('2026-09-07T22:01:30Z') / 1000) continue;
      const { day, hour } = sessionParts(instant, session);
      const weekend = day === 'Sat' || day === 'Fri' && hour >= 17 || day === 'Sun' && hour < (session === 'exness-metals' ? 18 : 17);
      if (!weekend && !(session === 'exness-metals' && hour === 17)) return false;
    }
    return true;
  }
  if (seconds === 86400) {
    // Daily bars follow the provider's local calendar, including DST.
    const { day } = sessionParts(time + seconds / 2, session);
    return day === 'Sat' || day === 'Sun';
  }
  // A derived H4 bucket is intentionally absent if even one H1 constituent is closed.
  for (let offset = 0; offset < seconds; offset += Math.min(seconds, 3600)) {
    const { day, hour } = sessionParts(time + offset, session);
    if (session === 'metal-futures' && (day === 'Sat' || (day === 'Fri' && hour >= 17) || (day === 'Sun' && hour < 18) || hour === 17)) return true;
    // Yahoo's FX feed uses London-dated bars, with a weekend cut-off that may precede broker close.
    if (session === 'forex' && (day === 'Sat' || day === 'Sun' || (day === 'Fri' && hour >= 22))) return true;
  }
  return false;
}

function cadenceIssue(rows: Candle[], seconds: number, session: SignalSession): string | null {
  // Check the recent 50-bar decision window; older data remains indicator warm-up only.
  const recent = rows.slice(-50);
  for (let i = 1; i < recent.length; i++) {
    const previous = recent[i - 1].time, current = recent[i].time, delta = current - previous;
    if (delta === seconds) continue;
    const dailySession = seconds === 86400 && (session === 'forex' || session === 'metal-futures');
    const localDelta = dailySession ? delta + sessionParts(current, session).offsetSeconds - sessionParts(previous, session).offsetSeconds : delta;
    const steps = Math.round(localDelta / seconds);
    // A 23h/25h day is allowed only when an actual provider-zone offset change explains it.
    if (steps < 1 || steps > 4 * 86400 / seconds || localDelta !== steps * seconds) {
      return 'Interval candle tidak konsisten pada 50 bar terakhir; setup diblokir.';
    }
    for (let step = 1; step < steps; step++) {
      if (!regularClosure(previous + step * seconds, seconds, session)) {
        const from = new Date(previous * 1000).toISOString(), to = new Date(current * 1000).toISOString();
        return `Candle hilang / jeda sesi belum terverifikasi antara ${from} dan ${to} pada 50 bar terakhir; setup diblokir. Muat ulang atau tunggu kontinuitas feed pulih; jeda ini tidak otomatis dianggap libur.`;
      }
    }
  }
  return null;
}

export function analyzeSignalFrame(input: FrameInput, now = Date.now()): FrameAnalysis {
  const result: FrameAnalysis = { timeframe: input.timeframe, quality: 'unavailable', lastClosedAt: null, expiresAt: null,
    bars: 0, excluded: 0, bias: 'neutral', regime: 'unknown', close: null, ema20: null, ema50: null, ema200: null,
    rsi: null, previousRsi: null, atr: null, atrPercent: null, adx: null, plusDI: null, minusDI: null,
    support: null, resistance: null, channelHigh: null, channelLow: null, trigger: null, extensionAtr: null, rangeAtr: null,
    relativeVolume: null, notes: [] };
  if (!validClock(now) || input.error) { result.notes.push(input.error ?? 'Waktu evaluasi tidak valid.'); return result; }
  const seconds = FRAME_SECONDS[input.timeframe], seen = new Set<number>(), rows: Candle[] = [];
  let previousTime = -Infinity;
  for (const candle of input.candles) {
    const time = signalCandleTime(candle.time);
    if (!Number.isFinite(time) || time <= 0 || time > now / 1000 || !validCandle(candle) || seen.has(time) || time < previousTime) {
      result.excluded++; continue;
    }
    seen.add(time); previousTime = time;
    if (time + seconds > now / 1000) continue; // Normal open candle is not a quality failure.
    rows.push({ ...candle, time });
  }
  result.bars = rows.length;
  if (result.excluded) result.notes.push(`${result.excluded} candle invalid/duplikat/masa depan; setup diblokir.`);
  if (rows.length < 250) { result.notes.push(`Pemanasan belum cukup: ${rows.length}/250 candle final.`); return result; }
  const last = rows.at(-1)!;
  const closedAt = (last.time + seconds) * 1000;
  // Latest closed bar normally ages up to one timeframe while the next forms.
  const expires = closedAt + (seconds + Math.min(300, seconds * .25)) * 1000;
  result.lastClosedAt = new Date(closedAt).toISOString(); result.expiresAt = new Date(expires).toISOString();
  result.close = last.close;
  if (result.excluded) return result;
  const session = input.session ?? 'continuous';
  const gap = cadenceIssue(rows, seconds, session);
  if (gap) { result.notes.push(gap); return result; }
  if (session.startsWith('exness-')) result.notes.push('Candle native UTC Exness; sesi reguler dan penutupan khusus XAU/XAG 7 Sep 2026 diperiksa. Gap lain tetap diblokir.');
  else if (session !== 'continuous') result.notes.push('Kontinuitas diperiksa pada 50 bar terakhir dengan perkiraan sesi reguler; hari libur/jadwal khusus belum diverifikasi.');
  result.quality = now > expires ? 'stale' : 'fresh';
  if (result.quality === 'stale') result.notes.unshift('Candle terakhir sudah basi; provider terlambat atau sesi pasar tutup.');
  const closes = rows.map(row => row.close), ema20 = signalEMA(closes, 20), ema50 = signalEMA(closes, 50), ema200 = signalEMA(closes, 200);
  const wilder = signalWilder(rows)!;
  Object.assign(result, wilder, { ema20: ema20.at(-1)!, ema50: ema50.at(-1)!, ema200: ema200.at(-1)!,
    rsi: signalRSI(closes), previousRsi: signalRSI(closes.slice(0, -1)), ...structure(rows, last.close, seconds) });
  if (!(wilder.atr > 0)) { result.quality = 'unavailable'; result.notes.push('Volatilitas tidak cukup untuk menghitung risiko.'); return result; }
  result.atrPercent = wilder.atr / last.close * 100;
  result.bias = result.ema50! > result.ema200! && result.ema50! > ema50.at(-5)! && last.close > result.ema50!
    ? 'bullish' : result.ema50! < result.ema200! && result.ema50! < ema50.at(-5)! && last.close < result.ema50! ? 'bearish' : 'neutral';
  result.regime = wilder.adx >= 25 ? 'trend' : wilder.adx < 20 ? 'range' : 'transition';
  const prior = rows.slice(-21, -1);
  result.channelHigh = Math.max(...prior.map(row => row.high)); result.channelLow = Math.min(...prior.map(row => row.low));
  entryTrigger(rows, result);
  result.extensionAtr = Math.abs(last.close - result.ema20!) / wilder.atr;
  result.rangeAtr = (last.high - last.low) / wilder.atr;
  const volumes = rows.slice(-21, -1).map(row => row.volume);
  if (volumes.every(finitePositive) && finitePositive(last.volume)) result.relativeVolume = last.volume / mean(volumes);
  return result;
}

function nearestObstacle(frames: FrameAnalysis[], entry: number, side: 'buy' | 'sell') {
  const direction = side === 'buy' ? 1 : -1;
  const levels = frames.flatMap(frame => (frame.structureLevels?.map(level => level.price) ?? [frame.support, frame.resistance])
    .filter((price): price is number => price !== null && finitePositive(price) && direction * (price - entry) > 0)
    .map(price => ({ price, timeframe: frame.timeframe })));
  return levels.sort((a, b) => direction * (a.price - b.price))[0] ?? null;
}

export function referenceSignalPlan(frame: FrameAnalysis, side: 'buy' | 'sell', frames: FrameAnalysis[] = [frame]): { plan: ReferencePlan | null; reason: string | null } {
  const entry = frame.close!, atr = frame.atr!;
  if (!finitePositive(entry) || !finitePositive(atr)) return { plan: null, reason: 'Harga/ATR tidak valid.' };
  const buy = side === 'buy';
  const structuralStop = frame.triggerStop ?? (buy ? frame.support : frame.resistance);
  const stop = buy ? Math.min(entry - 1.5 * atr, structuralStop === null ? Infinity : structuralStop - .2 * atr)
    : Math.max(entry + 1.5 * atr, structuralStop === null ? -Infinity : structuralStop + .2 * atr);
  const risk = Math.abs(entry - stop), barrier = nearestObstacle(frames, entry, side), obstacle = barrier?.price ?? null;
  if (!finitePositive(stop) || risk > 3 * atr || risk <= 0) return { plan: null, reason: 'Invalidasi struktur terlalu jauh (>3 ATR) atau level tidak valid.' };
  const defaultTarget = entry + (buy ? 1 : -1) * 2 * risk;
  // Respect the first known obstacle; never skip it to manufacture a high RR.
  const target = obstacle === null ? defaultTarget : buy ? Math.min(defaultTarget, obstacle - .1 * atr) : Math.max(defaultTarget, obstacle + .1 * atr);
  const reward = buy ? target - entry : entry - target;
  if (!finitePositive(target) || reward / risk < 1.5 - 1e-8) return { plan: null, reason: `Ruang ke support/resistance ${barrier?.timeframe ?? frame.timeframe} terdekat kurang dari 1,5R; tunggu struktur lain.` };
  const second = entry + (buy ? 1 : -1) * 3 * risk;
  return { plan: { side, entry, stopLoss: stop, takeProfit: target,
    secondTarget: finitePositive(second) && (obstacle === null || (buy ? second < obstacle : second > obstacle)) ? second : null,
    grossRiskReward: reward / risk, stopDistanceAtr: risk / atr, obstacle, obstacleTimeframe: barrier?.timeframe ?? null,
    basis: obstacle === null ? 'Target proyeksi 2R/3R; tidak ada penghalang pivot terkonfirmasi pada jendela tiga timeframe yang diperiksa.' : `Target dibatasi penghalang pivot terdekat pada ${barrier!.timeframe}; struktur tiga timeframe diperiksa.` }, reason: null };
}

/** Watch levels, never an actionable signal. A future breakout needs a fresh analysis. */
export function manualSignalScenarios(frames: FrameAnalysis[]): ManualScenario[] {
  if (frames.length !== 3 || frames.some(frame => frame.quality !== 'fresh')) return [];
  const base = frames[0], atr = base.atr, close = base.close;
  if (atr === null || close === null || !finitePositive(atr) || !finitePositive(close)) return [];
  return (['buy', 'sell'] as const).flatMap(side => {
    const buy = side === 'buy', channel = buy ? base.channelHigh : base.channelLow;
    if (channel === null || !finitePositive(channel)) return [];
    // Cross the channel and the known nearest pivot, rather than placing a TP
    // through a known obstacle. Further structure is unknown, not obstacle-free.
    const pivot = buy ? base.resistance : base.support;
    const boundary = buy ? Math.max(channel, pivot ?? channel, close) : Math.min(channel, pivot ?? channel, close);
    const direction = buy ? 1 : -1, entry = boundary + direction * .1 * atr;
    const distanceAtr = Math.abs(entry - close) / atr;
    if (distanceAtr > 3) return []; // Not a near-market watch opportunity.
    // Re-map ALL confirmed pivots at the proposed entry, not only the pivot
    // nearest the old close. This also checks H1/H4 (or H4/D1) obstacles.
    const evaluated = referenceSignalPlan({ ...base, close: entry, triggerStop: boundary }, side, frames);
    if (!evaluated.plan) return [];
    return [{ ...evaluated.plan, kind: 'conditional-breakout' as const, triggerPrice: boundary, distanceAtr,
      basis: `Entry indikatif setelah breakout + buffer 0,1 ATR; proyeksi belum aktif. ${evaluated.plan.basis}`,
      confirmation: `Tunggu candle ${base.timeframe} selesai ${buy ? 'di atas' : 'di bawah'} level pemicu; lalu pindai ulang. Tren ${frames.slice(1).map(frame => frame.timeframe).join('/')} harus mendukung ${side.toUpperCase()}, momentum dan ruang target harus diperiksa lagi.`,
      invalidation: 'Batal jika harga melewati SL sebelum konfirmasi, data kedaluwarsa, atau spread/berita membuat risiko tidak layak. Jangan memasang order otomatis dari skenario ini.',
    }];
  });
}

export function analyzeAdvancedSignal(meta: Pick<AdvancedSignal, 'symbol' | 'displaySymbol' | 'name' | 'marketType' | 'source'>,
  horizon: SignalHorizon, inputs: FrameInput[], now = Date.now()): AdvancedSignal {
  const expected = HORIZON_FRAMES[horizon];
  const session: SignalSession = meta.marketType === 'crypto' ? 'continuous' : ['XAU/USD', 'XAG/USD'].includes(meta.symbol) ? 'metal-futures' : 'forex';
  const frames = expected.map(timeframe => analyzeSignalFrame(inputs.filter(row => row.timeframe === timeframe).length === 1
    ? { ...inputs.find(row => row.timeframe === timeframe)!, session: inputs.find(row => row.timeframe === timeframe)!.session ?? session } : { timeframe, candles: [], error: 'Timeframe hilang atau duplikat.' }, now));
  const base = frames[0], bias = base.bias, buy = bias === 'bullish';
  const aligned = bias !== 'neutral' && frames.every(row => row.bias === bias);
  const conflict = bias !== 'neutral' && frames.slice(1).some(row => row.bias !== 'neutral' && row.bias !== bias);
  const rsiConfirmed = bias !== 'neutral' && base.rsi !== null && (buy ? base.rsi > 50 && base.rsi < 75 : base.rsi < 50 && base.rsi > 25);
  const diConfirmed = base.plusDI !== null && base.minusDI !== null && (buy ? base.plusDI > base.minusDI : base.minusDI > base.plusDI);
  const momentum = rsiConfirmed && diConfirmed;
  const reasons: string[] = [], cautions = [meta.source.note, 'Spread, slippage, biaya dan jadwal berita berdampak tinggi belum diverifikasi; cek broker/kalender.',
    'Model heuristik analisis, bukan strategi robot MT5, probabilitas profit, atau perintah order.'];
  if (meta.marketType === 'forex') cautions.push('Volume provider bukan volume spot Forex terpusat; tidak dipakai sebagai suara BUY/SELL.');
  const unavailable = frames.some(row => row.quality === 'unavailable'), stale = frames.some(row => row.quality === 'stale');
  let status: SetupStatus = unavailable ? 'unavailable' : stale ? 'stale' : conflict ? 'conflict' : 'wait';
  if (unavailable || stale) reasons.push(...frames.filter(row => row.quality !== 'fresh').flatMap(row => row.notes.map(note => `${row.timeframe}: ${note}`)));
  if (!unavailable && !stale) {
    if (conflict) reasons.push('Tren timeframe lebih tinggi berlawanan; jangan membaca momentum lokal sebagai konfirmasi.');
    if (!aligned) reasons.push('Tunggu bias tiga timeframe searah.');
    if (base.regime !== 'trend') reasons.push('ADX belum mencapai 25; model trend-following menunggu.');
    if (!rsiConfirmed) reasons.push('RSI belum melewati 50 searah tren atau sudah ekstrem; tunggu momentum yang mendukung.');
    if (!diConfirmed) reasons.push('Arah +DI/−DI belum mendukung bias harga.');
    if (!base.trigger) reasons.push(...(base.triggerNotes?.length ? base.triggerNotes : ['Tunggu breakout 20 bar yang kuat, retest pertama, atau recovery RSI + konfirmasi harga.']));
    else reasons.push(...base.triggerNotes ?? []);
  }
  const extended = (base.extensionAtr ?? Infinity) > 2.5 || (base.rangeAtr ?? Infinity) > 2.5;
  if (extended && !unavailable) reasons.push('Candle terlalu jauh dari EMA20 atau rentangnya >2,5 ATR; jangan mengejar gerakan.');
  const evaluated = !unavailable && !stale && bias !== 'neutral' ? referenceSignalPlan(base, buy ? 'buy' : 'sell', frames) : { plan: null, reason: null };
  if (evaluated.reason) reasons.push(evaluated.reason);
  let plan: ReferencePlan | null = null;
  if (!unavailable && !stale && aligned && momentum && base.regime === 'trend' && base.trigger && !extended) {
    plan = evaluated.plan;
    if (plan) { status = 'candidate'; reasons.push('Aturan setup terpenuhi pada candle final; validasi harga dan risiko broker tetap diperlukan.'); }
  }
  const groups = [
    { label: 'Tren lintas timeframe', points: aligned ? 25 : 0, maximum: 25, detail: aligned ? 'Tiga timeframe searah.' : 'Belum searah pada tiga timeframe.' },
    { label: 'Momentum RSI + DI', points: momentum ? 20 : 0, maximum: 20, detail: momentum ? 'RSI dan arah DI mendukung tanpa RSI ekstrem.' : 'RSI atau arah DI belum mendukung.' },
    { label: 'Konfirmasi entry', points: base.trigger ? 25 : 0, maximum: 25, detail: base.trigger === 'breakout' ? 'Breakout dengan buffer dan candle kuat.' : base.trigger === 'retest' ? 'Retest pertama bertahan setelah breakout.' : base.trigger === 'recovery' ? 'RSI pulih, harga menembus candle sebelumnya dan EMA20.' : 'Belum ada pemicu harga terkonfirmasi.' },
    { label: 'Ruang target lintas timeframe', points: evaluated.plan ? 20 : 0, maximum: 20, detail: evaluated.plan ? 'Minimal 1,5R kotor sebelum penghalang terdekat; biaya belum dihitung.' : evaluated.reason ?? 'Belum dapat menghitung rencana dari data ini.' },
    { label: 'Kekuatan tren & jarak entry', points: base.regime === 'trend' && !extended ? 10 : 0, maximum: 10, detail: base.regime === 'trend' && !extended ? 'ADX ≥25; candle dan jarak EMA20 tidak melebihi 2,5 ATR.' : 'Tren belum kuat atau harga terlalu jauh; jangan mengejar.' },
  ];
  const expiresAt = frames.every(row => row.expiresAt) ? new Date(Math.min(...frames.map(row => Date.parse(row.expiresAt!)))).toISOString() : null;
  return { ...meta, id: `${meta.symbol}:${horizon}:${base.lastClosedAt ?? 'none'}`, horizon, modelVersion: SIGNAL_MODEL_VERSION,
    generatedAt: new Date(validClock(now) ? now : 0).toISOString(), expiresAt, bias, status, conviction: unavailable || stale ? null : groups.reduce((sum, group) => sum + group.points, 0),
    setup: base.trigger === 'breakout' ? 'Breakout terkonfirmasi' : base.trigger === 'retest' ? 'Breakout retest' : base.trigger === 'recovery' ? 'Pullback recovery terkonfirmasi' : 'Menunggu pemicu',
    frames, reasons, cautions, plan, groups, manualScenarios: unavailable || stale || plan ? [] : manualSignalScenarios(frames) };
}
