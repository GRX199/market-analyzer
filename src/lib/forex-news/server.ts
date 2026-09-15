import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getSupabaseAdminClient } from '@/lib/supabase/server';
import { isTradingUserAuthorized } from '@/lib/trading/validation';
import { parseBrokerSnapshot } from '@/lib/analysis/broker-snapshot';
export const newsJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function newsUser() {
  try {
    const client = await createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    return !error && user ? { id: user.id, client } : null;
  } catch { return null; }
}
export function newsTradingError(owner: string, real: boolean): string | null {
  if (!isTradingUserAuthorized(owner, process.env.TRADING_ALLOWED_USER_IDS)) return 'Akun website tidak diizinkan mengirim order.';
  if (process.env.TRADING_ENABLED !== 'true') return 'Pengiriman order website sedang dinonaktifkan.';
  if (real && process.env.TRADING_REAL_ORDERS_ENABLED !== 'true') return 'Pengiriman order real sedang dinonaktifkan.';
  return null;
}
export async function brokerForNews(owner: string, symbol: string, accountKind: string) {
  const { data, error } = await getSupabaseAdminClient().from('signal_broker_snapshots').select('payload').eq('user_id', owner).eq('symbol', symbol).maybeSingle();
  if (error || !data) throw new Error('Snapshot MT5 belum tersedia. Jalankan worker manual + data bridge.');
  const snapshot = parseBrokerSnapshot(data.payload);
  if (snapshot.symbol !== symbol || snapshot.accountKind !== accountKind) throw new Error('Snapshot MT5 berasal dari akun/market yang berbeda.');
  return snapshot;
}
