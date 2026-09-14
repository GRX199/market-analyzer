import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ADVANCED_UNIVERSE, resolveSignalSymbol, scanAdvancedSignals, selectSignalUniverse, type SignalMarket, type SignalSource } from '@/services/advanced-signals';
import type { SignalHorizon } from '@/lib/analysis/advanced-signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? 'all', horizon = params.get('horizon') ?? 'intraday';
  const source = params.get('source') ?? 'market';
  const rawPage = params.get('page') ?? '0', rawSymbol = params.get('symbol');
  const symbol = rawSymbol === null ? null : resolveSignalSymbol(rawSymbol);
  if (!['all', 'forex', 'crypto'].includes(market) || !['market', 'mt5', 'reference'].includes(source) || !['intraday', 'swing'].includes(horizon)
    || !/^\d{1,2}$/.test(rawPage) || (rawSymbol !== null && symbol === null)) return json({ success: false, error: 'Filter Signals tidak valid.' }, 400);
  const page = Number(rawPage);
  const scope = selectSignalUniverse(market as SignalMarket, page, symbol);
  if (page >= scope.pages || (symbol && !scope.selected.length)) return json({ success: false, error: 'Simbol/halaman tidak sesuai market.' }, 400);
  let client;
  let userId: string;
  try {
    client = await createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ success: false, error: 'Silakan masuk kembali.' }, 401);
    userId = user.id;
  } catch { return json({ success: false, error: 'Layanan autentikasi belum tersedia.' }, 503); }
  try {
    const snapshots: Record<string, unknown> = {};
    let brokerError: string | undefined;
    const brokerSymbols = scope.selected.filter(asset => source === 'mt5' || source === 'market' && asset.marketType === 'forex').map(asset => asset.symbol);
    if (brokerSymbols.length) {
      try {
        const result = await client.from('signal_broker_snapshots').select('symbol,payload').eq('user_id', userId).in('symbol', brokerSymbols);
        if (result.error) brokerError = ['42P01', 'PGRST205'].includes(result.error.code)
          ? 'Tabel snapshot belum tersedia: jalankan migration 20260908000100_add_signal_broker_snapshots.sql.'
          : 'Data broker gagal dibaca dari penyimpanan. Periksa koneksi dan akses akun.';
        else for (const row of result.data ?? []) if (brokerSymbols.includes(row.symbol)) snapshots[row.symbol] = row.payload;
      } catch { brokerError = 'Penyimpanan snapshot MT5 tidak terhubung. Feed crypto spot tetap terpisah.'; }
    }
    const rows = await scanAdvancedSignals(scope.selected, horizon as SignalHorizon, { source: source as SignalSource, brokerSnapshots: snapshots, brokerError });
    return json({ success: true, data: rows, scope: { market, source, horizon, page, symbol, total: scope.total, pages: scope.pages },
      universe: ADVANCED_UNIVERSE, generatedAt: new Date().toISOString(),
      summary: { scanned: rows.length, candidates: rows.filter(row => row.status === 'candidate').length,
        unavailable: rows.filter(row => row.status === 'unavailable').length, stale: rows.filter(row => row.status === 'stale').length } });
  } catch { return json({ success: false, error: 'Pemindaian belum berhasil. Tidak ada order yang dikirim.' }, 503); }
}
