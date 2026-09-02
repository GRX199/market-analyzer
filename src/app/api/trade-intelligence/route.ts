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

export const runtime = 'nodejs';

const TRADE_FIELDS = [
  'id',
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
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapTrade(value: unknown): RobotTradeRecord | null {
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
    || typeof row.strategy !== 'string'
    || (row.market_type !== 'crypto' && row.market_type !== 'forex')
    || typeof row.symbol !== 'string'
    || (row.side !== 'buy' && row.side !== 'sell')
    || typeof row.entry_time !== 'string'
    || typeof row.exit_time !== 'string'
    || typeof row.exit_reason !== 'string'
    || typeof row.synced_at !== 'string'
    || Object.values(requiredNumbers).some((number) => number === null)
  ) return null;

  return {
    id: row.id,
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

function rangeStart(range: string | null): string | null {
  const days = range === '30' ? 30 : range === '365' ? 365 : range === 'all' ? null : 90;
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function GET(request: Request) {
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

  const start = rangeStart(new URL(request.url).searchParams.get('range'));
  let tradeQuery = admin
    .from('robot_trade_history')
    .select(TRADE_FIELDS)
    .eq('user_id', userId)
    .order('exit_time', { ascending: true })
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
  if (incidentResult.error) {
    console.error('Failed to load queue diagnostics', { code: incidentResult.error.code });
    return json({ error: 'Failed to load queue diagnostics' }, 500);
  }

  const trades = (tradeResult.data ?? [])
    .map(mapTrade)
    .filter((trade): trade is RobotTradeRecord => trade !== null);
  const incidents = (incidentResult.data ?? [])
    .map(mapIncident)
    .filter((incident): incident is QueueIncidentRecord => incident !== null);
  const generatedAt = new Date().toISOString();

  return json({
    report: analyzeTradeHistory(trades, incidents, generatedAt),
    trades: [...trades].reverse().slice(0, 100),
    lastSyncedAt: trades.reduce<string | null>(
      (latest, trade) => !latest || trade.syncedAt > latest ? trade.syncedAt : latest,
      null,
    ),
  }, 200);
}
