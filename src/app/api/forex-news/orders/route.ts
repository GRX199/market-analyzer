import { createHash } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getEconomicCalendar } from '@/services/economic-calendar';
import { affectedPairs, economicNumber } from '@/lib/forex-news/model';
import { brokerForNews, newsJson, newsTradingError, newsUser } from '@/lib/forex-news/server';
import { isTradeId, parseDirectTradeInput } from '@/lib/trading/validation';
import { readJsonBody, RequestBodyError } from '@/lib/trading/http';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await newsUser();
  if (!user) return newsJson({ error: 'Silakan login kembali.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    if (!isTradeId(id)) return newsJson({ error: 'ID tidak valid.' }, 400);
    const result = await user.client.from('forex_news_orders').select('*').eq('user_id', user.id).eq('id', id).maybeSingle();
    return result.error ? newsJson({ error: 'Status jadwal belum dapat dipastikan.' }, 503) : newsJson({ order: result.data });
  }
  const { data, error } = await user.client.from('forex_news_orders').select('*,trade:auto_trades(status,broker_order_ticket,error_message)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  return error ? newsJson({ error: 'Jadwal belum tersedia; jalankan migration forex news schedules.' }, 503) : newsJson({ orders: data });
}
export async function POST(request: Request) {
  const user = await newsUser();
  if (!user) return newsJson({ error: 'Silakan login kembali.' }, 401);
  const denied = newsTradingError(user.id, false);
  if (denied) return newsJson({ error: denied }, 403);
  try {
    const body = await readJsonBody(request) as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== 'object') return newsJson({ error: 'Payload tidak valid.' }, 400);
    if (body.ownerId !== user.id) return newsJson({ error: 'Akun website berubah. Muat ulang sebelum menjadwalkan.' }, 409);
    if (typeof body.id !== 'string' || !isTradeId(body.id) || typeof body.eventId !== 'string') return newsJson({ error: 'ID jadwal/event tidak valid.' }, 400);
    if (body.accountKind !== 'demo' && body.accountKind !== 'real') return newsJson({ error: 'Pilih akun.' }, 400);
    const realDenied = newsTradingError(user.id, body.accountKind === 'real');
    if (realDenied) return newsJson({ error: realDenied }, 403);
    if (body.confirmed !== true) return newsJson({ error: 'Konfirmasi parameter dan waktu order.' }, 400);
    const admin = getSupabaseAdminClient();
    // Freeze retry identity before reading a changing event or quote.
    const fingerprint = createHash('sha256').update(JSON.stringify([
      body.eventId, body.symbol, body.accountKind, body.orderType, body.volume, body.entryPrice,
      body.stopLoss, body.takeProfit, body.condition, body.offsetSeconds,
      body.eventTime, body.forecast,
    ])).digest('hex');
    const existing = await admin.from('forex_news_orders').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle();
    if (existing.error) return newsJson({ error: 'Jalankan migration forex news schedules terlebih dahulu.' }, 503);
    if (existing.data) return existing.data.request_fingerprint === fingerprint ? newsJson({ order: existing.data, duplicate: true }) : newsJson({ error: 'ID ini sudah dipakai parameter lain.' }, 409);
    const feed = await getEconomicCalendar(), event = feed.events.find(e => e.id === body.eventId);
    if (!event || !event.precise) return newsJson({ error: 'Event tidak ditemukan atau jam rilis belum pasti.' }, 400);
    if (body.eventTime !== event.scheduledAt || body.forecast !== event.forecast) return newsJson({ error: 'Waktu atau forecast berubah. Tutup formulir, perbarui kalender, lalu tinjau ulang.' }, 409);
    if (!Number.isInteger(body.offsetSeconds) || Number(body.offsetSeconds) < 0 || Number(body.offsetSeconds) > 600) return newsJson({ error: 'Jeda rilis harus 0–600 detik.' }, 400);
    if (!['at_time', 'actual_above', 'actual_below'].includes(String(body.condition))) return newsJson({ error: 'Syarat rilis tidak valid.' }, 400);
    if (body.condition !== 'at_time' && (!feed.actualsSupported || !economicNumber(event.forecast))) return newsJson({ error: 'Syarat aktual memerlukan feed aktual dan konsensus numerik.' }, 400);
    if (typeof body.symbol !== 'string' || !affectedPairs(event.currency).includes(body.symbol)) return newsJson({ error: 'Pilih market yang terkait mata uang event.' }, 400);
    const scheduled = Date.parse(event.scheduledAt) + Number(body.offsetSeconds) * 1000;
    if (scheduled <= Date.now() || scheduled > Date.now() + 8 * 86400000) return newsJson({ error: 'Waktu kirim harus di masa depan, maksimal delapan hari.' }, 400);
    const snapshot = await brokerForNews(user.id, body.symbol, body.accountKind);
    const orderType = String(body.orderType), quote = orderType.startsWith('buy') ? snapshot.ask : snapshot.bid;
    const parsed = parseDirectTradeInput({ ...body, symbol: snapshot.instrument, marketType: 'forex',
      action: orderType.startsWith('buy') ? 'buy' : 'sell', quotePrice: quote, idempotencyKey: `news:${body.id}`,
      conditionalAcknowledged: true, liveConfirmation: body.confirmed });
    if (!parsed.success) return newsJson({ error: parsed.error }, 400);
    const row = { id: body.id, user_id: user.id, event_id: event.id, event, symbol: body.symbol,
      instrument: snapshot.instrument, account_kind: body.accountKind, account_ref: snapshot.accountRef,
      order_type: parsed.data.orderType, volume: parsed.data.volume, entry_price: parsed.data.entryPrice,
      stop_loss: parsed.data.stopLoss, take_profit: parsed.data.takeProfit, condition: body.condition,
      scheduled_at: new Date(scheduled).toISOString(), expires_at: new Date(scheduled + 90000).toISOString(),
      offset_seconds: body.offsetSeconds, request_fingerprint: fingerprint };
    const { data, error } = await admin.from('forex_news_orders').insert(row).select('*').single();
    if (error?.code === '23505') {
      const retry = await admin.from('forex_news_orders').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle();
      if (retry.data?.request_fingerprint === fingerprint) return newsJson({ order: retry.data, duplicate: true });
      return newsJson({ error: 'Jadwal berbenturan; periksa riwayat sebelum mengulang.' }, 409);
    }
    return error ? newsJson({ error: 'Jadwal gagal disimpan.' }, 503) : newsJson({ order: data }, 201);
  } catch (error) { return newsJson({ error: error instanceof Error ? error.message : 'Jadwal tidak berhasil dibuat.' }, error instanceof RequestBodyError ? error.status : 400); }
}
export async function DELETE(request: Request) {
  const user = await newsUser();
  if (!user) return newsJson({ error: 'Silakan login kembali.' }, 401);
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!isTradeId(id)) return newsJson({ error: 'ID tidak valid.' }, 400);
  try {
    const { data, error } = await getSupabaseAdminClient().rpc('transition_forex_news_order', { p_id: id, p_owner: user.id, p_state: 'cancelled', p_reason: 'Dibatalkan pengguna sebelum masuk antrean.' });
    if (error) return newsJson({ error: 'Pembatalan belum terkonfirmasi.' }, 503);
    if (!data?.length) return newsJson({ error: 'Jadwal tidak ditemukan.' }, 404);
    return data[0].status === 'cancelled' ? newsJson({ order: data[0] }) : newsJson({ error: 'Jadwal sudah diproses. Periksa antrean dan MT5; pembatalan ini tidak menghapus order broker.' }, 409);
  } catch { return newsJson({ error: 'Pembatalan belum terkonfirmasi.' }, 503); }
}
