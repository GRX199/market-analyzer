import type { OHLCV } from '@/types/market';

export type SignalHorizon = 'intraday' | 'swing';
export type AnalysisTimeframe = '15m' | '1H' | '4H' | '1D';
export type SignalBias = 'bullish' | 'bearish' | 'neutral';
export type SetupStatus = 'candidate' | 'wait' | 'conflict' | 'stale' | 'unavailable';
export const SIGNAL_MODEL_VERSION = 'confluence-v2-manual';
export const HORIZON_FRAMES: Record<SignalHorizon, AnalysisTimeframe[]> = {
  intraday: ['15m', '1H', '4H'], swing: ['1H', '4H', '1D'],
};
export const FRAME_SECONDS: Record<AnalysisTimeframe, number> = { '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };

export type SignalSession = 'continuous' | 'forex' | 'metal-futures';
export interface FrameInput { timeframe: AnalysisTimeframe; candles: OHLCV[]; error?: string; session?: SignalSession }
export interface FrameAnalysis {
  timeframe: AnalysisTimeframe; quality: 'fresh' | 'stale' | 'unavailable';
  lastClosedAt: string | null; expiresAt: string | null; bars: number; excluded: number;
  bias: SignalBias; regime: 'trend' | 'range' | 'transition' | 'unknown';
  close: number | null; ema20: number | null; ema50: number | null; ema200: number | null;
  rsi: number | null; previousRsi: number | null; atr: number | null; atrPercent: number | null;
  adx: number | null; plusDI: number | null; minusDI: number | null;
  support: number | null; resistance: number | null; channelHigh: number | null; channelLow: number | null;
  trigger: 'breakout' | 'recovery' | null; extensionAtr: number | null; rangeAtr: number | null;
  relativeVolume: number | null; notes: string[];
}
export interface ReferencePlan {
  side: 'buy' | 'sell'; entry: number; stopLoss: number; takeProfit: number; secondTarget: number | null;
  grossRiskReward: number; stopDistanceAtr: number; obstacle: number | null; basis: string;
}
export interface ManualScenario extends ReferencePlan {
  kind: 'conditional-breakout'; triggerPrice: number; distanceAtr: number;
  confirmation: string; invalidation: string;
}
export interface AdvancedSignal {
  id: string; symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto';
  source: { provider: string; instrument: string; isProxy: boolean; note: string };
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

function structure(candles: Candle[], entry: number) {
  const rows = candles.slice(-122), levels: number[] = [];
  // A pivot is usable only after its two right-hand confirmation bars closed.
  for (let i = 2; i < rows.length - 2; i++) {
    const neighbors = [rows[i - 2], rows[i - 1], rows[i + 1], rows[i + 2]];
    if (neighbors.every(row => rows[i].high > row.high)) levels.push(rows[i].high);
    if (neighbors.every(row => rows[i].low < row.low)) levels.push(rows[i].low);
  }
  return { support: levels.filter(level => level < entry).sort((a, b) => b - a)[0] ?? null,
    resistance: levels.filter(level => level > entry).sort((a, b) => a - b)[0] ?? null };
}

const sessionClocks = {
  forex: new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', timeZoneName: 'shortOffset', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }),
  'metal-futures': new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }),
};
function sessionParts(time: number, session: Exclude<SignalSession, 'continuous'>) {
  const parts = sessionClocks[session].formatToParts(new Date(time * 1000));
  const offset = parts.find(part => part.type === 'timeZoneName')!.value.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
  const offsetSeconds = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2] ?? 0) * 3600 + Number(offset[3] ?? 0) * 60) : NaN;
  return { day: parts.find(part => part.type === 'weekday')!.value, hour: Number(parts.find(part => part.type === 'hour')!.value), offsetSeconds };
}

/** Limited regular-session heuristic, not a holiday calendar or broker availability check. */
function regularClosure(time: number, seconds: number, session: SignalSession): boolean {
  if (session === 'continuous') return false;
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
    const dailySession = seconds === 86400 && session !== 'continuous';
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
  if (session !== 'continuous') result.notes.push('Kontinuitas diperiksa pada 50 bar terakhir dengan perkiraan sesi reguler; hari libur/jadwal khusus belum diverifikasi.');
  result.quality = now > expires ? 'stale' : 'fresh';
  if (result.quality === 'stale') result.notes.unshift('Candle terakhir sudah basi; provider terlambat atau sesi pasar tutup.');
  const closes = rows.map(row => row.close), ema20 = signalEMA(closes, 20), ema50 = signalEMA(closes, 50), ema200 = signalEMA(closes, 200);
  const wilder = signalWilder(rows)!;
  Object.assign(result, wilder, { ema20: ema20.at(-1)!, ema50: ema50.at(-1)!, ema200: ema200.at(-1)!,
    rsi: signalRSI(closes), previousRsi: signalRSI(closes.slice(0, -1)), ...structure(rows, last.close) });
  if (!(wilder.atr > 0)) { result.quality = 'unavailable'; result.notes.push('Volatilitas tidak cukup untuk menghitung risiko.'); return result; }
  result.atrPercent = wilder.atr / last.close * 100;
  result.bias = result.ema50! > result.ema200! && result.ema50! > ema50.at(-5)! && last.close > result.ema50!
    ? 'bullish' : result.ema50! < result.ema200! && result.ema50! < ema50.at(-5)! && last.close < result.ema50! ? 'bearish' : 'neutral';
  result.regime = wilder.adx >= 25 ? 'trend' : wilder.adx < 20 ? 'range' : 'transition';
  const prior = rows.slice(-21, -1);
  result.channelHigh = Math.max(...prior.map(row => row.high)); result.channelLow = Math.min(...prior.map(row => row.low));
  const buy = result.bias === 'bullish', sell = result.bias === 'bearish';
  result.trigger = (buy && last.close > result.channelHigh) || (sell && last.close < result.channelLow) ? 'breakout'
    : (buy && result.previousRsi! <= 45 && result.rsi! > 45 && last.close > last.open)
      || (sell && result.previousRsi! >= 55 && result.rsi! < 55 && last.close < last.open) ? 'recovery' : null;
  result.extensionAtr = Math.abs(last.close - result.ema20!) / wilder.atr;
  result.rangeAtr = (last.high - last.low) / wilder.atr;
  const volumes = rows.slice(-21, -1).map(row => row.volume);
  if (volumes.every(finitePositive) && finitePositive(last.volume)) result.relativeVolume = last.volume / mean(volumes);
  return result;
}

export function referenceSignalPlan(frame: FrameAnalysis, side: 'buy' | 'sell'): { plan: ReferencePlan | null; reason: string | null } {
  const entry = frame.close!, atr = frame.atr!;
  if (!finitePositive(entry) || !finitePositive(atr)) return { plan: null, reason: 'Harga/ATR tidak valid.' };
  const buy = side === 'buy';
  const structuralStop = buy ? frame.support : frame.resistance;
  const stop = buy ? Math.min(entry - 1.5 * atr, structuralStop === null ? Infinity : structuralStop - .2 * atr)
    : Math.max(entry + 1.5 * atr, structuralStop === null ? -Infinity : structuralStop + .2 * atr);
  const risk = Math.abs(entry - stop), obstacle = buy ? frame.resistance : frame.support;
  if (!finitePositive(stop) || risk > 3 * atr || risk <= 0) return { plan: null, reason: 'Invalidasi struktur terlalu jauh (>3 ATR) atau level tidak valid.' };
  const defaultTarget = entry + (buy ? 1 : -1) * 2 * risk;
  // Respect the first known obstacle; never skip it to manufacture a high RR.
  const target = obstacle === null ? defaultTarget : buy ? Math.min(defaultTarget, obstacle - .1 * atr) : Math.max(defaultTarget, obstacle + .1 * atr);
  const reward = buy ? target - entry : entry - target;
  if (!finitePositive(target) || reward / risk < 1.5 - 1e-8) return { plan: null, reason: 'Ruang ke support/resistance terdekat kurang dari 1,5R; tunggu struktur lain.' };
  const second = entry + (buy ? 1 : -1) * 3 * risk;
  return { plan: { side, entry, stopLoss: stop, takeProfit: target,
    secondTarget: finitePositive(second) && (obstacle === null || (buy ? second < obstacle : second > obstacle)) ? second : null,
    grossRiskReward: reward / risk, stopDistanceAtr: risk / atr, obstacle,
    basis: obstacle === null ? 'Target skenario 2R/3R; belum ada penghalang pivot terkonfirmasi.' : 'Target dibatasi penghalang pivot terdekat.' }, reason: null };
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
    const risk = 1.5 * atr, stopLoss = entry - direction * risk;
    const takeProfit = entry + direction * 2 * risk, secondTarget = entry + direction * 3 * risk;
    if (![entry, stopLoss, takeProfit, secondTarget].every(finitePositive)) return [];
    return [{ kind: 'conditional-breakout' as const, side, entry, triggerPrice: boundary,
      stopLoss, takeProfit, secondTarget, grossRiskReward: 2, stopDistanceAtr: 1.5,
      obstacle: null, distanceAtr,
      basis: 'Entry indikatif setelah breakout + buffer 0,1 ATR; SL 1,5 ATR, TP1 2R, TP2 3R adalah proyeksi, bukan target struktur terkonfirmasi. Struktur berikutnya belum dipetakan.',
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
    ? { ...inputs.find(row => row.timeframe === timeframe)!, session } : { timeframe, candles: [], error: 'Timeframe hilang atau duplikat.' }, now));
  const base = frames[0], bias = base.bias, buy = bias === 'bullish';
  const aligned = bias !== 'neutral' && frames.every(row => row.bias === bias);
  const conflict = bias !== 'neutral' && frames.slice(1).some(row => row.bias !== 'neutral' && row.bias !== bias);
  const momentum = bias !== 'neutral' && base.rsi !== null && (buy ? base.rsi > 50 && base.rsi < 75 : base.rsi < 50 && base.rsi > 25);
  const groups = [
    { label: 'Tren lintas timeframe', points: aligned ? 40 : 0, maximum: 40, detail: aligned ? 'Tiga timeframe searah.' : 'Belum searah pada tiga timeframe.' },
    { label: 'Momentum RSI', points: momentum ? 25 : 0, maximum: 25, detail: momentum ? 'Momentum mendukung tanpa RSI ekstrem.' : 'Momentum belum mendukung / ekstrem.' },
    { label: 'Pemicu struktur', points: base.trigger ? 35 : 0, maximum: 35, detail: base.trigger === 'breakout' ? 'Close menembus channel 20 bar.' : base.trigger === 'recovery' ? 'RSI pulih dari pullback.' : 'Belum ada breakout atau recovery baru.' },
  ];
  const reasons: string[] = [], cautions = [meta.source.note, 'Spread, slippage, biaya dan jadwal berita berdampak tinggi belum diverifikasi; cek broker/kalender.',
    'Model heuristik analisis, bukan strategi robot MT5, probabilitas profit, atau perintah order.'];
  if (meta.marketType === 'forex') cautions.push('Volume provider bukan volume spot Forex terpusat; tidak dipakai sebagai suara BUY/SELL.');
  const unavailable = frames.some(row => row.quality === 'unavailable'), stale = frames.some(row => row.quality === 'stale');
  let status: SetupStatus = unavailable ? 'unavailable' : stale ? 'stale' : conflict ? 'conflict' : 'wait';
  if (unavailable || stale) reasons.push(...frames.filter(row => row.quality !== 'fresh').flatMap(row => row.notes.map(note => `${row.timeframe}: ${note}`)));
  if (conflict) reasons.push('Tren timeframe lebih tinggi berlawanan; jangan membaca momentum lokal sebagai konfirmasi.');
  if (!aligned) reasons.push('Tunggu bias tiga timeframe searah.');
  if (base.regime !== 'trend') reasons.push('ADX belum mencapai 25; model trend-following menunggu.');
  if (!momentum) reasons.push('RSI belum mendukung arah atau sudah ekstrem.');
  if (!base.trigger) reasons.push('Tunggu close breakout 20 bar atau RSI recovery 45/55.');
  const extended = (base.extensionAtr ?? Infinity) > 2.5 || (base.rangeAtr ?? Infinity) > 2.5;
  if (extended && !unavailable) reasons.push('Candle terlalu jauh dari EMA20 atau rentangnya >2,5 ATR; jangan mengejar gerakan.');
  let plan: ReferencePlan | null = null;
  if (!unavailable && !stale && aligned && momentum && base.regime === 'trend' && base.trigger && !extended) {
    const evaluated = referenceSignalPlan(base, buy ? 'buy' : 'sell');
    plan = evaluated.plan;
    if (plan) { status = 'candidate'; reasons.push('Aturan setup terpenuhi pada candle final; validasi harga dan risiko broker tetap diperlukan.'); }
    else if (evaluated.reason) reasons.push(evaluated.reason);
  }
  const expiresAt = frames.every(row => row.expiresAt) ? new Date(Math.min(...frames.map(row => Date.parse(row.expiresAt!)))).toISOString() : null;
  return { ...meta, id: `${meta.symbol}:${horizon}:${base.lastClosedAt ?? 'none'}`, horizon, modelVersion: SIGNAL_MODEL_VERSION,
    generatedAt: new Date(validClock(now) ? now : 0).toISOString(), expiresAt, bias, status, conviction: unavailable || stale ? null : groups.reduce((sum, group) => sum + group.points, 0),
    setup: base.trigger === 'breakout' ? 'Breakout 20 bar' : base.trigger === 'recovery' ? 'Pullback recovery' : 'Menunggu pemicu',
    frames, reasons, cautions, plan, groups, manualScenarios: unavailable || stale || plan ? [] : manualSignalScenarios(frames) };
}
