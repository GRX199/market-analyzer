import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

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

const CLAIM_FIELDS = [
  'id',
  'symbol',
  'market_type',
  'action',
  'volume',
  'status',
  'worker_id',
  'claimed_at',
  'created_at',
  'idempotency_key',
  'attempts',
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

async function findExistingWorkerClaim(
  admin: SupabaseClient,
  ownerUserId: string,
  workerId: string,
) {
  return admin
    .from('auto_trades')
    .select(CLAIM_FIELDS)
    .eq('user_id', ownerUserId)
    .eq('status', 'processing')
    .eq('worker_id', workerId)
    .order('claimed_at', { ascending: true })
    .limit(1)
    .maybeSingle();
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

  // A stable worker id turns claim into a recoverable operation. If the
  // previous HTTP response was lost after commit, return that same processing
  // row instead of taking another trade.
  const { data: existingClaim, error: existingClaimError } =
    await findExistingWorkerClaim(
      admin,
      ownerUserId,
      validated.data.worker_id,
    );
  if (existingClaimError) {
    console.error('Failed to recover an existing worker claim', {
      code: existingClaimError.code,
    });
    return json({ error: 'Failed to inspect worker claim state' }, 500);
  }
  if (existingClaim) {
    return json({ trades: [existingClaim], recovered: true }, 200);
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

  if (!data?.length) {
    // A concurrent retry can enter before the first request commits. The RPC
    // serializes both claim decisions; this second read recovers the row the
    // first request claimed for the same worker.
    const { data: racedClaim, error: racedClaimError } =
      await findExistingWorkerClaim(
        admin,
        ownerUserId,
        validated.data.worker_id,
      );
    if (racedClaimError) {
      console.error('Failed to recover a concurrent worker claim', {
        code: racedClaimError.code,
      });
      return json({ error: 'Failed to inspect worker claim state' }, 500);
    }
    if (racedClaim) {
      return json({ trades: [racedClaim], recovered: true }, 200);
    }
  }

  return json({ trades: data ?? [], recovered: false }, 200);
}
