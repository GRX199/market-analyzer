import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ADVANCED_UNIVERSE, resolveSignalSymbol, scanAdvancedSignals, selectSignalUniverse, type SignalMarket } from '@/services/advanced-signals';
import type { SignalHorizon } from '@/lib/analysis/advanced-signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? 'all', horizon = params.get('horizon') ?? 'swing';
  const rawPage = params.get('page') ?? '0', rawSymbol = params.get('symbol');
  const symbol = rawSymbol === null ? null : resolveSignalSymbol(rawSymbol);
  if (!['all', 'forex', 'crypto'].includes(market) || !['intraday', 'swing'].includes(horizon)
    || !/^\d{1,2}$/.test(rawPage) || (rawSymbol !== null && symbol === null)) return json({ success: false, error: 'Filter Signals tidak valid.' }, 400);
  const page = Number(rawPage);
  const scope = selectSignalUniverse(market as SignalMarket, page, symbol);
  if (page >= scope.pages || (symbol && !scope.selected.length)) return json({ success: false, error: 'Simbol/halaman tidak sesuai market.' }, 400);
  try {
    const client = await createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ success: false, error: 'Silakan masuk kembali.' }, 401);
  } catch { return json({ success: false, error: 'Layanan autentikasi belum tersedia.' }, 503); }
  try {
    const rows = await scanAdvancedSignals(scope.selected, horizon as SignalHorizon);
    return json({ success: true, data: rows, scope: { market, horizon, page, symbol, total: scope.total, pages: scope.pages },
      universe: ADVANCED_UNIVERSE, generatedAt: new Date().toISOString(),
      summary: { scanned: rows.length, candidates: rows.filter(row => row.status === 'candidate').length,
        unavailable: rows.filter(row => row.status === 'unavailable').length, stale: rows.filter(row => row.status === 'stale').length } });
  } catch { return json({ success: false, error: 'Pemindaian belum berhasil. Tidak ada order yang dikirim.' }, 503); }
}
