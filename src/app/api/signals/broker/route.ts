import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getSupabaseAdminClient } from '@/lib/supabase/server';
import { authorizeWorkerRequest, readJsonBody, RequestBodyError } from '@/lib/trading/http';
import { getSingleConfiguredUserId } from '@/lib/trading/validation';
import { parseBrokerSnapshot, type BrokerSnapshot } from '@/lib/analysis/broker-snapshot';
import { ADVANCED_UNIVERSE } from '@/services/advanced-signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  const auth = authorizeWorkerRequest(request);
  if (!auth.authorized) return json({ error: 'Autentikasi pengirim data gagal.' }, auth.misconfigured ? 503 : 401);
  const owner = getSingleConfiguredUserId(process.env.TRADING_ALLOWED_USER_IDS);
  if (!owner) return json({ error: 'Pemilik pengirim data belum dikonfigurasi.' }, 503);
  let snapshot: BrokerSnapshot;
  try {
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

/** Data bridge visibility is deliberately NOT robot-process visibility. */
export async function GET() {
  let client, owner: string;
  try {
    client = await createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ error: 'Silakan masuk kembali.' }, 401);
    owner = user.id;
  } catch { return json({ error: 'Autentikasi belum tersedia.' }, 503); }
  try {
    const { data, error } = await client.from('signal_broker_snapshots').select('symbol,payload').eq('user_id', owner).limit(48);
    if (error) return json({ error: ['42P01', 'PGRST205'].includes(error.code) ? 'Tabel snapshot belum tersedia; periksa migration broker Signals.' : 'Snapshot broker gagal dibaca.' }, 503);
    const now = Date.now(), accounts = new Set<string>();
    const feeds = (data ?? []).map(row => {
      try {
        const s = parseBrokerSnapshot(row.payload, now, false);
        if (s.symbol !== row.symbol) throw new Error('Symbol mismatch');
        const validUntil = Math.min(Date.parse(s.capturedAt), Date.parse(s.quoteTime)) + 180_000;
        const fresh = now < validUntil;
        if (fresh) accounts.add(s.accountRef);
        return { symbol: s.symbol, instrument: s.instrument, accountKind: s.accountKind, server: s.server, fresh,
          quoteTime: s.quoteTime, capturedAt: s.capturedAt, validUntil: new Date(validUntil).toISOString() };
      } catch { return { symbol: row.symbol, fresh: false, error: 'Snapshot invalid; periksa pengirim data.' }; }
    });
    return json({ checkedAt: new Date(now).toISOString(), dataOnly: true, robotProcess: 'unknown', mixedAccounts: accounts.size > 1, feeds }, 200);
  } catch { return json({ error: 'Koneksi penyimpanan snapshot gagal.' }, 503); }
}
