import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { authorizeWorkerRequest, readJsonBody, RequestBodyError } from '@/lib/trading/http';
import { getSingleConfiguredUserId } from '@/lib/trading/validation';
import type { BrokerSnapshot } from '@/lib/analysis/broker-snapshot';
import { ADVANCED_UNIVERSE } from '@/services/advanced-signals';

export const runtime = 'nodejs';
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  const auth = authorizeWorkerRequest(request);
  if (!auth.authorized) return json({ error: 'Autentikasi pengirim data gagal.' }, auth.misconfigured ? 503 : 401);
  const owner = getSingleConfiguredUserId(process.env.TRADING_ALLOWED_USER_IDS);
  if (!owner) return json({ error: 'Pemilik pengirim data belum dikonfigurasi.' }, 503);
  let snapshot: BrokerSnapshot;
  try {
    const { parseBrokerSnapshot } = await import('@/lib/analysis/broker-snapshot');
    snapshot = parseBrokerSnapshot(await readJsonBody(request, 512 * 1024));
    if (!ADVANCED_UNIVERSE.some(asset => asset.symbol === snapshot.symbol)) throw new Error('Simbol di luar katalog Signals.');
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Snapshot tidak valid.' }, error instanceof RequestBodyError ? error.status : 400); }
  try {
    const { data, error } = await getSupabaseAdminClient().rpc('publish_signal_snapshot', {
      p_user_id: owner, p_symbol: snapshot.symbol, p_captured_at: snapshot.capturedAt, p_payload: snapshot,
    });
    if (error) return json({ error: ['42883', 'PGRST202', '42P01'].includes(error.code)
      ? 'Jalankan migration 20260908000100_add_signal_broker_snapshots.sql terlebih dahulu.' : 'Penyimpanan snapshot MT5 gagal.' }, 503);
    return json({ accepted: data === true, symbol: snapshot.symbol }, data === true ? 200 : 409);
  } catch { return json({ error: 'Penyimpanan snapshot belum tersedia.' }, 503); }
}
