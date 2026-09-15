import { authorizeWorkerRequest, readJsonBody, RequestBodyError } from '@/lib/trading/http';
import { getSingleConfiguredUserId, parseDirectTradeInput } from '@/lib/trading/validation';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getEconomicCalendar } from '@/services/economic-calendar';
import { releaseDecision, type NewsSchedule } from '@/lib/forex-news/model';
import { brokerForNews, newsJson, newsTradingError } from '@/lib/forex-news/server';

export const runtime = 'nodejs';

// Called by the updated manual worker. This only dispatches explicit, previously
// confirmed user instructions; it cannot create a strategy or choose new levels.
export async function POST(request: Request) {
  const auth = authorizeWorkerRequest(request);
  if (!auth.authorized) return newsJson({ error: 'Worker authentication failed.' }, auth.misconfigured ? 503 : 401);
  const owner = getSingleConfiguredUserId(process.env.TRADING_ALLOWED_USER_IDS);
  if (!owner) return newsJson({ error: 'Trading owner is not configured.' }, 503);
  try {
    const body = await readJsonBody(request) as Record<string, unknown>;
    if (!body || !['demo', 'real'].includes(String(body.account_kind)) || typeof body.account_ref !== 'string'
      || !/^[a-f0-9]{24}$/.test(body.account_ref)) return newsJson({ error: 'Exact worker account is required.' }, 400);
    const denied = newsTradingError(owner, body.account_kind === 'real');
    if (denied) return newsJson({ error: denied }, 403);
    const admin = getSupabaseAdminClient(), now = Date.now();
    const { data, error } = await admin.from('forex_news_orders').select('*')
      .eq('user_id', owner).eq('account_kind', body.account_kind).eq('account_ref', body.account_ref)
      .eq('status', 'armed').lte('scheduled_at', new Date(now).toISOString())
      .order('scheduled_at', { ascending: true }).limit(16);
    if (error) return newsJson({ error: 'News schedule storage unavailable. Check migration.' }, 503);
    const results: { id: string; status: string }[] = [];
    const transition = async (schedule: NewsSchedule, state: string, reason: string, quote?: number) => {
      const result = await admin.rpc('transition_forex_news_order', {
        p_id: schedule.id, p_owner: owner, p_state: state, p_reason: reason,
        p_quote: quote ?? null, p_account_ref: body.account_ref,
      });
      if (result.error) throw new Error('Schedule transition unavailable.');
      if (result.data?.[0]) results.push({ id: schedule.id, status: result.data[0].status });
    };
    const due: NewsSchedule[] = [];
    for (const schedule of (data ?? []) as NewsSchedule[]) {
      if (Date.parse(schedule.expires_at) <= now) await transition(schedule, 'expired', 'Worker tidak memproses dalam jendela pengiriman.');
      else due.push(schedule);
    }
    if (!due.length) return newsJson({ results });
    const feed = await getEconomicCalendar();
    for (const schedule of due) {
      const decision = releaseDecision(schedule, feed, Date.now());
      if (decision.state === 'wait') continue;
      if (decision.state !== 'ready') { await transition(schedule, decision.state, decision.reason); continue; }
      let snapshot;
      // An unavailable/stale bridge is retryable only until the fixed deadline.
      try { snapshot = await brokerForNews(owner, schedule.symbol, schedule.account_kind); } catch { continue; }
      if (snapshot.accountRef !== schedule.account_ref || snapshot.instrument !== schedule.instrument) {
        await transition(schedule, 'blocked', 'Akun atau simbol broker berubah sejak jadwal dibuat.'); continue;
      }
      const quote = schedule.order_type.startsWith('buy') ? snapshot.ask : snapshot.bid;
      const parsed = parseDirectTradeInput({ symbol: schedule.instrument, marketType: 'forex',
        action: schedule.order_type.startsWith('buy') ? 'buy' : 'sell', orderType: schedule.order_type,
        volume: schedule.volume, quotePrice: quote, entryPrice: schedule.entry_price,
        stopLoss: schedule.stop_loss, takeProfit: schedule.take_profit, accountKind: schedule.account_kind,
        idempotencyKey: `news:${schedule.id}`, conditionalAcknowledged: true, liveConfirmation: true });
      if (!parsed.success) { await transition(schedule, 'blocked', `Level tidak valid saat rilis: ${parsed.error}`); continue; }
      await transition(schedule, 'queued', decision.reason, quote);
    }
    return newsJson({ results });
  } catch (error) {
    return newsJson({ error: error instanceof RequestBodyError ? error.message : 'News processing unavailable; retry uses the same schedule.' }, error instanceof RequestBodyError ? error.status : 503);
  }
}
