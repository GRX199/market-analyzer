import { NextResponse } from 'next/server';

import { createServerSupabaseClient, getSupabaseAdminClient } from '@/lib/supabase/server';
import { readJsonBody, RequestBodyError } from '@/lib/trading/http';
import { isTradingUserAuthorized, parseDirectTradeInput } from '@/lib/trading/validation';

export const runtime = 'nodejs';

const TRADE_FIELDS = [
  'id', 'symbol', 'market_type', 'action', 'volume', 'order_type',
  'quote_price', 'entry_price', 'stop_loss', 'take_profit', 'account_kind',
  'status', 'idempotency_key', 'attempts', 'created_at', 'claimed_at',
  'executed_at', 'execution_price', 'executed_volume', 'broker_order_ticket',
  'error_message',
].join(',');

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ error: 'Authentication required' }, 401);
    userId = user.id;
  } catch {
    return json({ error: 'Authentication service is unavailable' }, 503);
  }

  if (!isTradingUserAuthorized(userId, process.env.TRADING_ALLOWED_USER_IDS)) {
    return json({ error: 'User is not authorized for direct trading' }, 403);
  }
  if (process.env.TRADING_ENABLED !== 'true') {
    return json({ error: 'Trading is disabled on the server' }, 503);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: 'Invalid request body' }, 400);
  }
  const validated = parseDirectTradeInput(body);
  if (!validated.success) return json({ error: validated.error }, 400);
  if (validated.data.accountKind === 'real' && process.env.TRADING_REAL_ORDERS_ENABLED !== 'true') {
    return json({ error: 'Real-account direct orders are locked. Enable TRADING_REAL_ORDERS_ENABLED only after broker and risk review.' }, 503);
  }

  let admin;
  try { admin = getSupabaseAdminClient(); } catch { return json({ error: 'Trade service is not configured' }, 503); }

  const tradeToCreate = {
    user_id: userId,
    symbol: validated.data.symbol,
    market_type: validated.data.marketType,
    action: validated.data.action,
    volume: validated.data.volume,
    order_type: validated.data.orderType,
    quote_price: validated.data.quotePrice,
    entry_price: validated.data.entryPrice,
    stop_loss: validated.data.stopLoss,
    take_profit: validated.data.takeProfit,
    account_kind: validated.data.accountKind,
    status: 'pending',
    idempotency_key: validated.data.idempotencyKey,
    attempts: 0,
  };

  const { data: createdTrade, error: insertError } = await admin
    .from('auto_trades').insert(tradeToCreate).select(TRADE_FIELDS).single();
  if (!insertError && createdTrade) return json({ trade: createdTrade, duplicate: false }, 201);

  if (insertError?.code === '23505') {
    const { data: existingTrade, error: lookupError } = await admin
      .from('auto_trades').select(TRADE_FIELDS).eq('user_id', userId)
      .eq('idempotency_key', validated.data.idempotencyKey).maybeSingle();
    if (lookupError) return json({ error: 'Failed to inspect existing order request' }, 500);
    if (!existingTrade) return json({ error: 'Trade request conflicts with an existing record' }, 409);
    const existing = existingTrade as unknown as Record<string, unknown>;
    const same = ['symbol', 'market_type', 'action', 'order_type', 'account_kind'].every((key) =>
      existing[key] === tradeToCreate[key as keyof typeof tradeToCreate])
      && Number(existing.volume) === tradeToCreate.volume
      && Number(existing.quote_price) === tradeToCreate.quote_price
      && Number(existing.entry_price) === tradeToCreate.entry_price
      && Number(existing.stop_loss) === tradeToCreate.stop_loss
      && Number(existing.take_profit) === tradeToCreate.take_profit;
    return same
      ? json({ trade: existingTrade, duplicate: true }, 200)
      : json({ error: 'Idempotency key is already bound to a different order request' }, 409);
  }
  console.error('Failed to enqueue direct order', { code: insertError?.code ?? 'unknown' });
  return json({ error: 'Failed to enqueue direct order' }, 500);
}
