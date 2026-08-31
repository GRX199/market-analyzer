export interface KlineData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
  startTime: number;
}

export const BINANCE_HISTORY_LIMIT = 120;
export const BINANCE_MAX_RECONNECT_ATTEMPTS = 8;
export const BINANCE_MIN_SIGNAL_HISTORY = 13;

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidKline(candle: KlineData): boolean {
  return (
    Number.isFinite(candle.startTime)
    && candle.startTime > 0
    && [candle.open, candle.high, candle.low, candle.close].every(isFinitePositive)
    && Number.isFinite(candle.volume)
    && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.close)
    && candle.low <= Math.min(candle.open, candle.close)
  );
}

export function mergeClosedKlines(
  current: KlineData[],
  incoming: KlineData[],
  limit = BINANCE_HISTORY_LIMIT,
): KlineData[] {
  const boundedLimit = Number.isInteger(limit) && limit > 0
    ? limit
    : BINANCE_HISTORY_LIMIT;
  const candlesByStart = new Map<number, KlineData>();

  for (const candle of [...current, ...incoming]) {
    if (candle.isFinal && isValidKline(candle)) {
      candlesByStart.set(candle.startTime, { ...candle, isFinal: true });
    }
  }

  return [...candlesByStart.values()]
    .sort((first, second) => first.startTime - second.startTime)
    .slice(-boundedLimit);
}

export function parseBinanceRestKlines(
  payload: unknown,
  now = Date.now(),
): KlineData[] {
  if (!Array.isArray(payload)) return [];

  const parsed: KlineData[] = [];
  for (const value of payload) {
    if (!Array.isArray(value) || value.length < 7) continue;

    const startTime = Number(value[0]);
    const open = Number(value[1]);
    const high = Number(value[2]);
    const low = Number(value[3]);
    const close = Number(value[4]);
    const volume = Number(value[5]);
    const closeTime = Number(value[6]);
    const candle: KlineData = {
      open,
      high,
      low,
      close,
      volume,
      isFinal: Number.isFinite(closeTime) && closeTime < now,
      startTime,
    };

    if (candle.isFinal && isValidKline(candle)) {
      parsed.push(candle);
    }
  }

  return mergeClosedKlines([], parsed);
}

export function hasSufficientClosedHistory(
  history: KlineData[],
  minimum = BINANCE_MIN_SIGNAL_HISTORY,
): boolean {
  if (!Number.isInteger(minimum) || minimum <= 0) return false;
  return mergeClosedKlines([], history).length >= minimum;
}

export function parseBinanceStreamKline(value: unknown): KlineData | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const candle: KlineData = {
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v),
    isFinal: row.x === true,
    startTime: Number(row.t),
  };

  return isValidKline(candle) ? candle : null;
}

export function getBinanceReconnectDelay(attempt: number): number {
  const safeAttempt = Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  return Math.min(1_000 * (2 ** (safeAttempt - 1)), 30_000);
}
