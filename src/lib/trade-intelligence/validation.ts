import type { ValidationResult } from '@/lib/trading/validation';

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;
const ACCOUNT_REF_PATTERN = /^[0-9a-f]{24}$/;
const POSITION_ID_PATTERN = /^[1-9][0-9]{0,31}$/;
const STRATEGY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9./_#-]{1,31}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SYNC_TRADES = 50;
const MAX_ABSOLUTE_MONEY = 1_000_000_000_000;

export interface ClosedTradeSyncInput {
  account_ref: string;
  broker_position_id: string;
  strategy: string;
  market_type: 'crypto' | 'forex';
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  initial_stop_loss: number | null;
  initial_take_profit: number | null;
  gross_profit: number;
  commission: number;
  swap: number;
  fee: number;
  duration_seconds: number;
  exit_reason: string;
  entry_comment: string | null;
}

export interface TradeHistorySyncInput {
  worker_id: string;
  trades: ClosedTradeSyncInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure<T>(error: string): ValidationResult<T> {
  return { success: false, error };
}

function finiteNumber(
  value: unknown,
  field: string,
  minimum = -MAX_ABSOLUTE_MONEY,
  maximum = MAX_ABSOLUTE_MONEY,
): ValidationResult<number> {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    return failure(`${field} must be a finite number in the allowed range`);
  }
  return { success: true, data: value };
}

function optionalPositivePrice(
  value: unknown,
  field: string,
): ValidationResult<number | null> {
  if (value === null || value === undefined || value === 0) {
    return { success: true, data: null };
  }
  const parsed = finiteNumber(value, field, Number.MIN_VALUE);
  return parsed.success ? { success: true, data: parsed.data } : parsed;
}

function timestamp(value: unknown, field: string): ValidationResult<string> {
  if (typeof value !== 'string') {
    return failure(`${field} must be an RFC 3339 timestamp`);
  }
  const normalized = value.trim();
  if (!RFC3339_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    return failure(`${field} must be an RFC 3339 timestamp`);
  }
  return { success: true, data: new Date(normalized).toISOString() };
}

function parseTrade(value: unknown, index: number): ValidationResult<ClosedTradeSyncInput> {
  const prefix = `trades[${index}]`;
  if (!isRecord(value)) return failure(`${prefix} must be an object`);

  if (typeof value.account_ref !== 'string' || !ACCOUNT_REF_PATTERN.test(value.account_ref)) {
    return failure(`${prefix}.account_ref is invalid`);
  }
  if (
    typeof value.broker_position_id !== 'string'
    || !POSITION_ID_PATTERN.test(value.broker_position_id)
  ) return failure(`${prefix}.broker_position_id is invalid`);
  if (typeof value.strategy !== 'string' || !STRATEGY_PATTERN.test(value.strategy)) {
    return failure(`${prefix}.strategy is invalid`);
  }
  if (value.market_type !== 'crypto' && value.market_type !== 'forex') {
    return failure(`${prefix}.market_type must be crypto or forex`);
  }
  if (typeof value.symbol !== 'string' || !SYMBOL_PATTERN.test(value.symbol)) {
    return failure(`${prefix}.symbol is invalid`);
  }
  if (value.side !== 'buy' && value.side !== 'sell') {
    return failure(`${prefix}.side must be buy or sell`);
  }
  if (typeof value.exit_reason !== 'string' || !REASON_PATTERN.test(value.exit_reason)) {
    return failure(`${prefix}.exit_reason is invalid`);
  }

  const volume = finiteNumber(value.volume, `${prefix}.volume`, Number.MIN_VALUE, 1_000_000);
  if (!volume.success) return volume;
  const entryPrice = finiteNumber(value.entry_price, `${prefix}.entry_price`, Number.MIN_VALUE);
  if (!entryPrice.success) return entryPrice;
  const exitPrice = finiteNumber(value.exit_price, `${prefix}.exit_price`, Number.MIN_VALUE);
  if (!exitPrice.success) return exitPrice;
  const stopLoss = optionalPositivePrice(value.initial_stop_loss, `${prefix}.initial_stop_loss`);
  if (!stopLoss.success) return stopLoss;
  const takeProfit = optionalPositivePrice(value.initial_take_profit, `${prefix}.initial_take_profit`);
  if (!takeProfit.success) return takeProfit;
  const grossProfit = finiteNumber(value.gross_profit, `${prefix}.gross_profit`);
  if (!grossProfit.success) return grossProfit;
  const commission = finiteNumber(value.commission, `${prefix}.commission`);
  if (!commission.success) return commission;
  const swap = finiteNumber(value.swap, `${prefix}.swap`);
  if (!swap.success) return swap;
  const fee = finiteNumber(value.fee, `${prefix}.fee`);
  if (!fee.success) return fee;
  const entryTime = timestamp(value.entry_time, `${prefix}.entry_time`);
  if (!entryTime.success) return entryTime;
  const exitTime = timestamp(value.exit_time, `${prefix}.exit_time`);
  if (!exitTime.success) return exitTime;
  if (Date.parse(exitTime.data) < Date.parse(entryTime.data)) {
    return failure(`${prefix}.exit_time cannot be before entry_time`);
  }
  if (
    typeof value.duration_seconds !== 'number'
    || !Number.isInteger(value.duration_seconds)
    || value.duration_seconds < 0
    || value.duration_seconds > 315_576_000
  ) return failure(`${prefix}.duration_seconds is invalid`);

  let entryComment: string | null = null;
  if (value.entry_comment !== null && value.entry_comment !== undefined) {
    if (
      typeof value.entry_comment !== 'string'
      || value.entry_comment.length < 1
      || value.entry_comment.length > 64
      || /[\u0000-\u001f\u007f]/.test(value.entry_comment)
    ) return failure(`${prefix}.entry_comment is invalid`);
    entryComment = value.entry_comment;
  }

  return {
    success: true,
    data: {
      account_ref: value.account_ref,
      broker_position_id: value.broker_position_id,
      strategy: value.strategy,
      market_type: value.market_type,
      symbol: value.symbol,
      side: value.side,
      volume: volume.data,
      entry_time: entryTime.data,
      exit_time: exitTime.data,
      entry_price: entryPrice.data,
      exit_price: exitPrice.data,
      initial_stop_loss: stopLoss.data,
      initial_take_profit: takeProfit.data,
      gross_profit: grossProfit.data,
      commission: commission.data,
      swap: swap.data,
      fee: fee.data,
      duration_seconds: value.duration_seconds,
      exit_reason: value.exit_reason,
      entry_comment: entryComment,
    },
  };
}

export function parseTradeHistorySyncInput(
  value: unknown,
): ValidationResult<TradeHistorySyncInput> {
  if (!isRecord(value)) return failure('request body must be a JSON object');
  if (typeof value.worker_id !== 'string' || !WORKER_ID_PATTERN.test(value.worker_id)) {
    return failure('worker_id must be 3-64 safe characters');
  }
  if (!Array.isArray(value.trades) || value.trades.length > MAX_SYNC_TRADES) {
    return failure(`trades must be an array with at most ${MAX_SYNC_TRADES} items`);
  }

  const trades: ClosedTradeSyncInput[] = [];
  const identities = new Set<string>();
  for (let index = 0; index < value.trades.length; index += 1) {
    const parsed = parseTrade(value.trades[index], index);
    if (!parsed.success) return parsed;
    const identity = `${parsed.data.account_ref}:${parsed.data.broker_position_id}`;
    if (identities.has(identity)) return failure('trades contains duplicate position identities');
    identities.add(identity);
    trades.push(parsed.data);
  }

  return {
    success: true,
    data: {
      worker_id: value.worker_id,
      trades,
    },
  };
}
