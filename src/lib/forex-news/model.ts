export const NEWS_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'] as const;
export type NewsCurrency = typeof NEWS_CURRENCIES[number];
export type ReleaseCondition = 'at_time' | 'actual_above' | 'actual_below';
export interface EconomicEvent {
  id: string; provider: 'forexfactory' | 'tradingeconomics'; title: string; currency: NewsCurrency;
  scheduledAt: string; precise: boolean; importance: number;
  actual: string; forecast: string; previous: string; revised: string;
  source: string; sourceUrl: string; updatedAt: string | null;
}
export interface CalendarFeed {
  events: EconomicEvent[]; provider: EconomicEvent['provider']; fetchedAt: string;
  actualsSupported: boolean; note: string;
}
export interface NewsSchedule {
  id: string; event_id: string; event: EconomicEvent; symbol: string; instrument: string;
  account_kind: 'demo' | 'real'; account_ref: string; order_type: string;
  volume: number; entry_price: number; stop_loss: number; take_profit: number;
  condition: ReleaseCondition; scheduled_at: string; expires_at: string; offset_seconds: number;
  status: 'armed' | 'queued' | 'cancelled' | 'expired' | 'blocked';
  reason: string | null; trade_id: string | null; created_at: string;
  trade?: { status: string; broker_order_ticket: string | null; error_message: string | null } | null;
}

// Unit-aware comparison: percentage points never compare to counts or a range.
export function economicNumber(value: string): { value: number; unit: string } | null {
  if (value.includes(',') && !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*[KMBT%]?$/i.test(value.trim())) return null;
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([KMBT%]?)$/i.exec(value.trim().replace(/,/g, ''));
  if (!match) return null;
  const unit = match[2].toUpperCase();
  const multiplier = ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[unit] ?? 1;
  const number = Number(match[1]) * multiplier;
  return Number.isFinite(number) ? { value: number, unit: unit === '%' ? '%' : 'number' } : null;
}
export function surprise(actual: string, forecast: string): number | null {
  const a = economicNumber(actual), f = economicNumber(forecast);
  if (!a || !f || a.unit !== f.unit) return null;
  const delta = a.value - f.value;
  return Math.abs(delta) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a.value), Math.abs(f.value)) ? 0 : delta;
}
export function affectedPairs(currency: NewsCurrency) {
  return ['XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/JPY', 'EUR/GBP']
    .filter(symbol => symbol.split('/').includes(currency));
}
export function pairImplication(currency: NewsCurrency, symbol: string, strength: number) {
  if (!affectedPairs(currency).includes(symbol) || ![-1, 1].includes(strength)) return 'Tidak ada bias arah mekanis.';
  const direction = symbol.split('/')[0] === currency ? strength : -strength;
  return `${symbol} berpotensi ${direction > 0 ? 'naik (bias BUY)' : 'turun (bias SELL)'}; bukan konfirmasi entry.`;
}
export function analyzeEvent(event: EconomicEvent, now = Date.now()) {
  const inverse = /unemployment|jobless|unemployment claims/i.test(event.title);
  const positive = /payroll|employment change|retail sales|gdp|pmi|inflation|\bcpi\b|\bppi\b|interest rate|cash rate|bank rate/i.test(event.title);
  const ambiguous = /speech|speaks|minutes|press conference|auction|holiday|summit/i.test(event.title);
  const policy = /inflation|\bcpi\b|\bppi\b|interest rate|cash rate|bank rate/i.test(event.title);
  const polarity = ambiguous ? 0 : inverse ? -1 : positive ? 1 : 0;
  const delta = Date.parse(event.scheduledAt) <= now ? surprise(event.actual, event.forecast) : null;
  const bias = delta === null || !polarity ? 'Belum ada bias aktual' : delta === 0 ? 'Sesuai konsensus' :
    delta * polarity > 0 ? `${event.currency} cenderung menguat` : `${event.currency} cenderung melemah`;
  return {
    bias, delta, polarity, pairs: affectedPairs(event.currency),
    above: !polarity ? 'Interpretasi angka saja tidak cukup; baca konteks rilis.' : `${event.currency} berpotensi ${polarity > 0 ? 'menguat' : 'melemah'} bila aktual di atas konsensus.`,
    below: !polarity ? 'Arah dipengaruhi pernyataan, revisi, dan ekspektasi pasar.' : `${event.currency} berpotensi ${polarity > 0 ? 'melemah' : 'menguat'} bila aktual di bawah konsensus.`,
    note: policy ? 'Inflasi/suku bunga bekerja melalui ekspektasi kebijakan; respons pasar bisa berlawanan.' : 'Bias adalah skenario makro, bukan probabilitas menang. Rilis bersamaan dan revisi dapat mengubah arah.',
  };
}

export function releaseDecision(schedule: NewsSchedule, feed: CalendarFeed, now: number) {
  if (![schedule.expires_at, schedule.scheduled_at, schedule.event.scheduledAt, feed.fetchedAt].every(value => Number.isFinite(Date.parse(value)))) {
    return { state: 'blocked', reason: 'Timestamp kalender/jadwal tidak valid.' } as const;
  }
  if (now >= Date.parse(schedule.expires_at)) return { state: 'expired', reason: 'Jendela pengiriman news berakhir.' } as const;
  if (now < Date.parse(schedule.scheduled_at)) return { state: 'wait', reason: 'Belum waktunya.' } as const;
  const event = feed.events.find(item => item.id === schedule.event_id);
  if (!event || event.scheduledAt !== schedule.event.scheduledAt || !event.precise) {
    return { state: 'blocked', reason: 'Event hilang, waktu berubah, atau jam rilis belum pasti. Jadwalkan ulang.' } as const;
  }
  if (schedule.condition === 'at_time') return { state: 'ready', reason: 'Waktu pilihan pengguna tercapai.' } as const;
  if (!feed.actualsSupported || Date.parse(feed.fetchedAt) < Date.parse(event.scheduledAt)
    || Date.parse(feed.fetchedAt) > now + 5000 || !Number.isFinite(Date.parse(event.updatedAt ?? ''))
    || !event.updatedAt || Date.parse(event.updatedAt) < Date.parse(event.scheduledAt)
    || Date.parse(event.updatedAt) > now + 5000 || now - Date.parse(feed.fetchedAt) > 30000) {
    return { state: 'wait', reason: 'Menunggu aktual terverifikasi dari feed rilis.' } as const;
  }
  // Compare against the forecast frozen when the user armed this schedule.
  const delta = surprise(event.actual, schedule.event.forecast);
  if (delta === null) return { state: 'wait', reason: 'Aktual/konsensus belum dapat dibandingkan.' } as const;
  if (schedule.condition === 'actual_above' ? delta > 0 : delta < 0) return { state: 'ready', reason: 'Syarat aktual terpenuhi.' } as const;
  return { state: 'blocked', reason: 'Aktual pertama yang terbaca tidak memenuhi syarat pilihan Anda.' } as const;
}
