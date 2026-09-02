import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import {
  authorizeWorkerRequest,
  readJsonBody,
  RequestBodyError,
} from '@/lib/trading/http';
import { getSingleConfiguredUserId } from '@/lib/trading/validation';
import { parseTradeHistorySyncInput } from '@/lib/trade-intelligence/validation';

export const runtime = 'nodejs';

function json(
  body: Record<string, unknown>,
  status: number,
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const authorization = authorizeWorkerRequest(request);
  if (!authorization.authorized) {
    return authorization.misconfigured
      ? json({ error: 'Trade worker authentication is not configured' }, 503)
      : json({ error: 'Unauthorized' }, 401);
  }

  const ownerUserId = getSingleConfiguredUserId(
    process.env.TRADING_ALLOWED_USER_IDS,
  );
  if (!ownerUserId) {
    return json({ error: 'Trading owner is not configured correctly' }, 503);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 64 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Invalid request body' }, 400);
  }

  const validated = parseTradeHistorySyncInput(body);
  if (!validated.success) {
    return json({ error: validated.error }, 400);
  }
  if (validated.data.trades.length === 0) {
    return json({ synced: 0 }, 200);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Trade service is not configured' }, 503);
  }

  const now = new Date().toISOString();
  const rows = validated.data.trades.map((trade) => ({
    user_id: ownerUserId,
    ...trade,
    synced_at: now,
    updated_at: now,
  }));
  const { error } = await admin
    .from('robot_trade_history')
    .upsert(rows, {
      onConflict: 'user_id,account_ref,broker_position_id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error('Failed to sync robot trade history', { code: error.code });
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return json({ error: 'Trade intelligence migration is not installed' }, 503);
    }
    return json({ error: 'Failed to sync robot trade history' }, 500);
  }

  return json({ synced: rows.length }, 200);
}
