import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import {
  authorizeWorkerRequest,
  readJsonBody,
  RequestBodyError,
} from '@/lib/trading/http';
import {
  getSingleConfiguredUserId,
  parseClaimTradesInput,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';

function json(
  body: Record<string, unknown>,
  status: number
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

  if (process.env.TRADING_ENABLED !== 'true') {
    return json({ error: 'Automated trading is disabled on the server' }, 503);
  }

  const ownerUserId = getSingleConfiguredUserId(
    process.env.TRADING_ALLOWED_USER_IDS
  );
  if (!ownerUserId) {
    return json({ error: 'Trading owner is not configured correctly' }, 503);
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

  const validated = parseClaimTradesInput(body);
  if (!validated.success) {
    return json({ error: validated.error }, 400);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Trade service is not configured' }, 503);
  }

  // The argument names intentionally match the Data API contract exactly.
  const { data, error } = await admin.rpc('claim_auto_trades', {
    worker_id: validated.data.worker_id,
    owner_user_id: ownerUserId,
    limit: validated.data.limit,
  });

  if (error) {
    console.error('Failed to claim queued trades', { code: error.code });
    return json({ error: 'Failed to claim queued trades' }, 500);
  }

  return json({ trades: data ?? [] }, 200);
}
