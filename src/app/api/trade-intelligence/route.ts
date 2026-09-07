import { NextResponse } from 'next/server';

import {
  createServerSupabaseClient,
  getSupabaseAdminClient,
} from '@/lib/supabase/server';
import {
  analyzeTradeHistory,
  type QueueIncidentRecord,
  type RobotTradeRecord,
} from '@/lib/trade-intelligence/analytics';
import { evaluateStrategyEvidence } from '@/lib/trade-intelligence/strategy-evidence';

export const runtime = 'nodejs';

const TRADE_FIELDS = [
  'id',
  'account_ref',
  'strategy',
  'market_type',
  'symbol',
  'side',
  'volume',
  'entry_time',
  'exit_time',
  'entry_price',
  'exit_price',
  'initial_stop_loss',
  'initial_take_profit',
  'gross_profit',
  'commission',
  'swap',
  'fee',
  'net_profit',
  'duration_seconds',
  'exit_reason',
  'entry_comment',
  'synced_at',
].join(',');

const INCIDENT_FIELDS = [
  'id',
  'symbol',
  'action',
  'status',
  'created_at',
  'error_message',
].join(',');

function json(
  body: Record<string, unknown>,
  status: number,
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapTrade(value: unknown, asOf: number): RobotTradeRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const requiredNumbers = {
    volume: numberOrNull(row.volume),
    entryPrice: numberOrNull(row.entry_price),
    exitPrice: numberOrNull(row.exit_price),
    grossProfit: numberOrNull(row.gross_profit),
    commission: numberOrNull(row.commission),
    swap: numberOrNull(row.swap),
    fee: numberOrNull(row.fee),
    netProfit: numberOrNull(row.net_profit),
    durationSeconds: numberOrNull(row.duration_seconds),
  };
  if (
    typeof row.id !== 'string'
    || typeof row.account_ref !== 'string' || !/^[0-9a-f]{24}$/.test(row.account_ref)
    || typeof row.strategy !== 'string'
    || (row.market_type !== 'crypto' && row.market_type !== 'forex')
    || typeof row.symbol !== 'string'
    || (row.side !== 'buy' && row.side !== 'sell')
    || typeof row.entry_time !== 'string'
    || typeof row.exit_time !== 'string'
    || typeof row.exit_reason !== 'string'
    || typeof row.synced_at !== 'string'
    || Object.values(requiredNumbers).some((number) => number === null)
    || !Number.isFinite(Date.parse(String(row.entry_time)))
    || !Number.isFinite(Date.parse(String(row.exit_time)))
    || Date.parse(String(row.exit_time)) < Date.parse(String(row.entry_time))
    || Date.parse(String(row.exit_time)) > asOf
    || (requiredNumbers.volume ?? 0) <= 0
  ) return null;

  const computedNet = requiredNumbers.grossProfit! + requiredNumbers.commission! + requiredNumbers.swap! + requiredNumbers.fee!;
  if (Math.abs(computedNet - requiredNumbers.netProfit!) > 0.000001) return null;

  return {
    id: row.id,
    accountRef: row.account_ref,
    strategy: row.strategy,
    marketType: row.market_type,
    symbol: row.symbol,
    side: row.side,
    volume: requiredNumbers.volume!,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    entryPrice: requiredNumbers.entryPrice!,
    exitPrice: requiredNumbers.exitPrice!,
    initialStopLoss: numberOrNull(row.initial_stop_loss),
    initialTakeProfit: numberOrNull(row.initial_take_profit),
    grossProfit: requiredNumbers.grossProfit!,
    commission: requiredNumbers.commission!,
    swap: requiredNumbers.swap!,
    fee: requiredNumbers.fee!,
    netProfit: requiredNumbers.netProfit!,
    durationSeconds: requiredNumbers.durationSeconds!,
    exitReason: row.exit_reason,
    entryComment: typeof row.entry_comment === 'string' ? row.entry_comment : null,
    syncedAt: row.synced_at,
  };
}

function mapIncident(value: unknown): QueueIncidentRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.symbol !== 'string'
    || (row.action !== 'buy' && row.action !== 'sell')
    || typeof row.status !== 'string'
    || typeof row.created_at !== 'string'
  ) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    action: row.action,
    status: row.status,
    createdAt: row.created_at,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
  };
}

function rangeStart(range: string | null, asOf: number): string | null {
  const days = range === '30' ? 30 : range === '365' ? 365 : range === 'all' ? null : 90;
  if (days === null) return null;
  return new Date(asOf - days * 86_400_000).toISOString();
}

export async function GET(request: Request) {
  // Capture once: query range, validity cutoff and evidence share one clock,
  // even when authentication/database calls take time or cross a candle close.
  const asOf = Date.now();
  const generatedAt = new Date(asOf).toISOString();
  const params = new URL(request.url).searchParams;
  const requestedAccount = params.get('account');
  const range = params.get('range') ?? '90';
  if ((requestedAccount && !/^[0-9a-f]{24}$/.test(requestedAccount))
    || !['30', '90', '365', 'all'].includes(range)) return json({ error: 'Invalid account or range filter' }, 400);
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ error: 'Authentication required' }, 401);
    userId = user.id;
  } catch {
    return json({ error: 'Authentication service is unavailable' }, 503);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Trade service is not configured' }, 503);
  }

  const accountResult = await admin.from('robot_trade_history')
    .select('account_ref', { count: 'exact' }).eq('user_id', userId)
    .order('exit_time', { ascending: false }).limit(1_000);
  if (accountResult.error) {
    const missing = ['42P01', 'PGRST205'].includes(accountResult.error.code);
    return json({ error: missing ? 'Trade intelligence migration is not installed' : 'Failed to load trading accounts',
      ...(missing ? { migrationRequired: '20260902000100_add_trade_intelligence.sql' } : {}) }, missing ? 503 : 500);
  }
  const accounts: string[] = [...new Set<string>((accountResult.data ?? [])
    .map((row: { account_ref: unknown }) => row.account_ref)
    .filter((ref: unknown): ref is string => typeof ref === 'string' && /^[0-9a-f]{24}$/.test(ref)))];
  const accountRef = requestedAccount || accounts[0] || null;
  const start = rangeStart(range, asOf);
  let tradeQuery = admin
    .from('robot_trade_history')
    .select(TRADE_FIELDS, { count: 'exact' })
    .eq('user_id', userId)
    .eq('account_ref', accountRef ?? '')
    .order('exit_time', { ascending: false })
    .order('id', { ascending: false })
    .limit(1_000);
  let incidentQuery = admin
    .from('auto_trades')
    .select(INCIDENT_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1_000);
  if (start) {
    tradeQuery = tradeQuery.gte('exit_time', start);
    incidentQuery = incidentQuery.gte('created_at', start);
  }

  const [tradeResult, incidentResult] = await Promise.all([
    tradeQuery,
    incidentQuery,
  ]);
  if (tradeResult.error) {
    console.error('Failed to load robot trade history', { code: tradeResult.error.code });
    if (
      tradeResult.error.code === '42P01'
      || tradeResult.error.code === 'PGRST205'
    ) {
      return json({
        error: 'Trade intelligence migration is not installed',
        migrationRequired: '20260902000100_add_trade_intelligence.sql',
      }, 503);
    }
    return json({ error: 'Failed to load robot trade history' }, 500);
  }

  const trades = (tradeResult.data ?? [])
    .map((row) => mapTrade(row, asOf))
    .filter((trade): trade is RobotTradeRecord => trade !== null);
  const incidents = (incidentResult.data ?? [])
    .map(mapIncident)
    .filter((incident): incident is QueueIncidentRecord => incident !== null);
  const invalidRows = (tradeResult.data ?? []).length - trades.length;
  const truncated = tradeResult.count === null || tradeResult.count === undefined
    ? (tradeResult.data ?? []).length >= 1_000 : tradeResult.count > 1_000;

  return json({
    report: analyzeTradeHistory(trades, incidents, generatedAt),
    trades: trades.slice(0, 100),
    evidence: evaluateStrategyEvidence(trades, accountRef, truncated || invalidRows > 0, asOf),
    scope: { accountRef, accounts, range, tradeLimit: 1_000, totalMatched: tradeResult.count ?? null,
      truncated, invalidRows, accountDiscoveryTruncated: (accountResult.count ?? 1_000) > 1_000
        || (accountResult.count == null && (accountResult.data ?? []).length >= 1_000),
      unit: 'account_currency_unknown', queueDiagnosticsAvailable: !incidentResult.error },
    lastSyncedAt: trades.reduce<string | null>(
      (latest, trade) => !latest || trade.syncedAt > latest ? trade.syncedAt : latest,
      null,
    ),
  }, 200);
}
