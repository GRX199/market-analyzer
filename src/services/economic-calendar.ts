import { createHash } from 'node:crypto';
import { NEWS_CURRENCIES, type EconomicEvent, type CalendarFeed, type NewsCurrency } from '@/lib/forex-news/model';

const countries: Record<string, NewsCurrency> = {
  'United States': 'USD', 'Euro Area': 'EUR', Germany: 'EUR', France: 'EUR', Italy: 'EUR', Spain: 'EUR',
  'United Kingdom': 'GBP', Japan: 'JPY', Switzerland: 'CHF', Canada: 'CAD', Australia: 'AUD', 'New Zealand': 'NZD',
};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 240) : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
function utc(value: unknown, te = false) {
  let raw = text(value);
  if (te && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(raw)) raw += 'Z';
  if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw) || !Number.isFinite(Date.parse(raw))) return null;
  return new Date(raw).toISOString();
}
function safeUrl(value: unknown) {
  try { const url = new URL(text(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function decodeCalendar(raw: unknown, provider: EconomicEvent['provider'], now = Date.now()): EconomicEvent[] {
  if (!Array.isArray(raw) || raw.length > 5000) throw new Error('Format kalender provider tidak valid.');
  const events: EconomicEvent[] = [], ids = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>, te = provider === 'tradingeconomics';
    const currency = te ? countries[text(r.Country)] : text(r.country);
    const title = text(te ? r.Event : r.title), scheduledAt = utc(te ? r.Date : r.date, te);
    if (!currency || !NEWS_CURRENCIES.includes(currency as NewsCurrency) || !title || !scheduledAt) continue;
    if (Math.abs(Date.parse(scheduledAt) - now) > 8 * 86400000) continue;
    const importance = te ? Number(r.Importance) : ({ High: 3, Medium: 2, Low: 1 } as Record<string, number>)[text(r.impact)] ?? 0;
    const providerId = text(r.CalendarId ?? r.CalendarID);
    if (te && !providerId) continue;
    const id = `${provider}:${te ? providerId : createHash('sha256').update(`${currency}|${title}|${scheduledAt}`).digest('hex').slice(0, 24)}`;
    if (ids.has(id)) throw new Error('Event duplikat dari provider; kalender tidak dapat dipakai untuk order.');
    ids.add(id);
    events.push({ id, provider, title, currency: currency as NewsCurrency, scheduledAt,
      precise: (te ? String(r.DateSpan) === '0' : true) && !/holiday|tentative|all day|summit/i.test(title),
      importance: [1, 2, 3].includes(importance) ? importance : 0,
      actual: te && Date.parse(scheduledAt) <= now ? text(r.Actual) : '',
      forecast: text(te ? r.Forecast : r.forecast), previous: text(te ? r.Previous : r.previous),
      revised: te ? text(r.Revised) : '', updatedAt: te ? utc(r.LastUpdate, true) : null,
      source: te ? text(r.Source) || 'Trading Economics' : 'Forex Factory · weekly export',
      sourceUrl: te ? safeUrl(r.SourceURL) || 'https://tradingeconomics.com/calendar' : 'https://www.forexfactory.com/calendar',
    });
  }
  return events.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || b.importance - a.importance);
}

let cache: { key: string; until: number; feed: CalendarFeed } | undefined;
let pending: { key: string; promise: Promise<CalendarFeed> } | undefined;
export async function getEconomicCalendar(): Promise<CalendarFeed> {
  const key = process.env.TRADING_ECONOMICS_API_KEY?.trim() ?? '';
  const provider = key ? 'tradingeconomics' : 'forexfactory';
  if (cache?.key === key && cache.until > Date.now()) return cache.feed;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const today = new Date(), start = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const url = key ? `https://api.tradingeconomics.com/calendar/country/All/${start}/${end}?c=${encodeURIComponent(key)}&f=json&values=true` : 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    let response: Response;
    try {
      response = await fetch(url, { ...(key ? { cache: 'no-store' as const } : { next: { revalidate: 3600 } }),
        signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw new Error('Provider kalender tidak dapat dihubungi. Jadwal tidak dibuat dari data contoh.'); }
    if (!response.ok) throw new Error(`Provider kalender HTTP ${response.status}. ${key ? 'Periksa akses kalender pada API key.' : 'Coba lagi setelah jeda provider.'}`);
    const body = await response.text();
    if (body.length > 4_000_000) throw new Error('Respons kalender terlalu besar.');
    let data: unknown;
    try { data = JSON.parse(body); } catch { throw new Error('Provider tidak mengembalikan kalender JSON.'); }
    const now = Date.now(), events = decodeCalendar(data, provider, now);
    const feed: CalendarFeed = { events, provider, fetchedAt: new Date(now).toISOString(), actualsSupported: !!key,
      note: key ? 'Aktual mengikuti latensi dan paket Trading Economics; bukan feed eksekusi milidetik.' : 'Kalender mingguan Forex Factory, cache 1 jam. Aktual tidak tersedia; jam dapat berubah. Mode syarat aktual memerlukan Trading Economics API.' };
    cache = { key, until: now + (key ? 15000 : 3600000), feed };
    return feed;
  })();
  pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}
