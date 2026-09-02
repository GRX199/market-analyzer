import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import {
  authorizeWorkerRequest,
  readJsonBody,
  RequestBodyError,
} from '@/lib/trading/http';
import {
  isTradeId,
  parseFinalizeTradeInput,
} from '@/lib/trading/validation';
import { matchesCommittedTerminalResult } from '@/lib/trading/finalization';

export const runtime = 'nodejs';

const TRADE_FIELDS = [
  'id',
  'symbol',
  'market_type',
  'action',
  'volume',
  'executed_volume',
  'status',
  'worker_id',
  'idempotency_key',
  'attempts',
  'claimed_at',
  'executed_at',
  'execution_price',
  'broker_order_ticket',
  'error_message',
].join(',');

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = authorizeWorkerRequest(request);
  if (!authorization.authorized) {
    return authorization.misconfigured
      ? json({ error: 'Trade worker authentication is not configured' }, 503)
      : json({ error: 'Unauthorized' }, 401);
  }

  const { id } = await context.params;
  if (!isTradeId(id)) {
    return json({ error: 'Invalid trade id' }, 400);
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

  const validated = parseFinalizeTradeInput(body);
  if (!validated.success) {
    return json({ error: validated.error }, 400);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Trade service is not configured' }, 503);
  }

  const result =
    validated.data.status === 'executed'
      ? {
          status: 'executed',
          execution_price: validated.data.execution_price,
          executed_volume: validated.data.executed_volume,
          broker_order_ticket: validated.data.broker_order_ticket,
          executed_at: new Date().toISOString(),
          error_message: null,
        }
      : {
          status: 'failed',
          execution_price: null,
          executed_volume: null,
          broker_order_ticket: null,
          executed_at: null,
          error_message: validated.data.error_message,
        };

  const { data: finalizedTrade, error } = await admin
    .from('auto_trades')
    .update(result)
    .eq('id', id)
    .eq('worker_id', validated.data.worker_id)
    .eq('idempotency_key', validated.data.idempotency_key)
    .eq('claimed_at', validated.data.claimed_at)
    .eq('attempts', validated.data.attempts)
    .eq('status', 'processing')
    .select(TRADE_FIELDS)
    .maybeSingle();

  if (error) {
    console.error('Failed to finalize queued trade', { code: error.code });
    return json({ error: 'Failed to finalize queued trade' }, 500);
  }

  if (!finalizedTrade) {
    const { data: committedTrade, error: lookupError } = await admin
      .from('auto_trades')
      .select(TRADE_FIELDS)
      .eq('id', id)
      .eq('worker_id', validated.data.worker_id)
      .eq('idempotency_key', validated.data.idempotency_key)
      .eq('claimed_at', validated.data.claimed_at)
      .eq('attempts', validated.data.attempts)
      .maybeSingle();

    if (lookupError) {
      console.error('Failed to inspect queued trade after finalize conflict', {
        code: lookupError.code,
      });
      return json({ error: 'Failed to inspect queued trade state' }, 500);
    }

    if (
      committedTrade
      && matchesCommittedTerminalResult(committedTrade, validated.data)
    ) {
      return json({ trade: committedTrade, replayed: true }, 200);
    }

    return json(
      {
        error:
          'Trade claim is stale, not processing, or does not belong to this worker request',
      },
      409
    );
  }

  return json({ trade: finalizedTrade, replayed: false }, 200);
}
