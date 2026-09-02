import { NextResponse } from 'next/server';

import {
  createServerSupabaseClient,
  getSupabaseAdminClient,
} from '@/lib/supabase/server';
import { readJsonBody, RequestBodyError } from '@/lib/trading/http';
import {
  isTradingUserAuthorized,
  parseCreateTradeInput,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';

const TRADE_FIELDS = [
  'id',
  'symbol',
  'market_type',
  'action',
  'volume',
  'executed_volume',
  'status',
  'idempotency_key',
  'attempts',
  'created_at',
  'claimed_at',
  'executed_at',
  'execution_price',
  'broker_order_ticket',
  'error_message',
].join(',');

interface ComparableTrade {
  symbol: string;
  market_type: string;
  action: string;
  volume: number;
}

function toComparableTrade(value: unknown): ComparableTrade | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const volume = Number(row.volume);
  if (
    typeof row.symbol !== 'string'
    || typeof row.market_type !== 'string'
    || typeof row.action !== 'string'
    || !Number.isFinite(volume)
  ) {
    return null;
  }
  return {
    symbol: row.symbol,
    market_type: row.market_type,
    action: row.action,
    volume,
  };
}

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return json({ error: 'Authentication required' }, 401);
    }
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

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get('limit') ?? '10');
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 25)
    : 10;
  const idempotencyKey = searchParams.get('idempotencyKey')?.trim();
  if (
    idempotencyKey
    && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/.test(idempotencyKey)
  ) {
    return json({ error: 'Invalid idempotency key filter' }, 400);
  }

  let query = admin
    .from('auto_trades')
    .select(TRADE_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (idempotencyKey) {
    query = query.eq('idempotency_key', idempotencyKey);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to load queued trade history', {
      code: error.code,
    });
    return json({ error: 'Failed to load queued trade history' }, 500);
  }

  return json({ trades: data ?? [] }, 200);
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return json({ error: 'Authentication required' }, 401);
    }
    userId = user.id;
  } catch {
    return json({ error: 'Authentication service is unavailable' }, 503);
  }

  if (
    !isTradingUserAuthorized(
      userId,
      process.env.TRADING_ALLOWED_USER_IDS
    )
  ) {
    return json({ error: 'User is not authorized for this trading worker' }, 403);
  }

  if (process.env.TRADING_ENABLED !== 'true') {
    return json({ error: 'Automated trading is disabled on the server' }, 503);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Invalid request body' }, 400);
  }

  const validated = parseCreateTradeInput(body);
  if (!validated.success) {
    return json({ error: validated.error }, 400);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Trade service is not configured' }, 503);
  }

  const tradeToCreate = {
    user_id: userId,
    symbol: validated.data.symbol,
    market_type: validated.data.marketType,
    action: validated.data.action,
    volume: validated.data.volume,
    status: 'pending',
    idempotency_key: validated.data.idempotencyKey,
    attempts: 0,
  };

  const { data: createdTrade, error: insertError } = await admin
    .from('auto_trades')
    .insert(tradeToCreate)
    .select(TRADE_FIELDS)
    .single();

  if (!insertError && createdTrade) {
    return json({ trade: createdTrade, duplicate: false }, 201);
  }

  if (insertError?.code === '23505') {
    const { data: existingTrade, error: lookupError } = await admin
      .from('auto_trades')
      .select(TRADE_FIELDS)
      .eq('user_id', userId)
      .eq('idempotency_key', validated.data.idempotencyKey)
      .maybeSingle();

    if (!lookupError && existingTrade) {
      const comparableTrade = toComparableTrade(existingTrade);
      if (!comparableTrade) {
        return json({ error: 'Existing trade record is malformed' }, 500);
      }
      const matchesOriginalRequest = (
        comparableTrade.symbol === tradeToCreate.symbol
        && comparableTrade.market_type === tradeToCreate.market_type
        && comparableTrade.action === tradeToCreate.action
        && comparableTrade.volume === tradeToCreate.volume
      );
      if (!matchesOriginalRequest) {
        return json(
          { error: 'Idempotency key is already bound to a different trade request' },
          409
        );
      }
      return json({ trade: existingTrade, duplicate: true }, 200);
    }

    return json({ error: 'Trade request conflicts with an existing record' }, 409);
  }

  console.error('Failed to enqueue trade', {
    code: insertError?.code ?? 'unknown',
  });
  return json({ error: 'Failed to enqueue trade' }, 500);
}
