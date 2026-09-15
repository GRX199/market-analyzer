import type { AdvancedSignal, SetupStatus } from './advanced-signals';

/** Preserve fractional JPY quotes and small crypto levels; broker tick rounding happens at execution. */
export function formatSignalPrice(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('id-ID', { maximumFractionDigits: 8 }) : '—';
}

export interface SignalReceiptClock {
  receivedAt: number;
  receivedMonotonicAt: number;
  requestDurationMs: number;
}

export interface SignalDisplayClock { wall: number; monotonic: number }
export function advanceSignalClock(previous: SignalDisplayClock, wall: number, monotonic: number): SignalDisplayClock {
  return { wall: Math.max(previous.wall, wall), monotonic: Math.max(previous.monotonic, monotonic) };
}

/** Conservative server clock: a slow response or backwards wall clock cannot renew a setup. */
export function signalDisplayTime(generatedAt: string, receipt: SignalReceiptClock, wallNow: number, monotonicNow: number): number {
  const generated = Date.parse(generatedAt);
  const values = [generated, receipt.receivedAt, receipt.receivedMonotonicAt, receipt.requestDurationMs, wallNow, monotonicNow];
  if (values.some(value => !Number.isFinite(value)) || generated <= 0 || receipt.requestDurationMs < 0
    || monotonicNow < receipt.receivedMonotonicAt) return Infinity;
  // Adding the full request duration overestimates response transit time safely.
  return generated + receipt.requestDurationMs + Math.max(0, wallNow - receipt.receivedAt, monotonicNow - receipt.receivedMonotonicAt);
}

export function effectiveSignalStatus(row: Pick<AdvancedSignal, 'expiresAt' | 'status'>, now: number): SetupStatus {
  if (row.status === 'unavailable') return 'unavailable';
  const expires = Date.parse(row.expiresAt ?? '');
  return !Number.isFinite(now) || !Number.isFinite(expires) || now >= expires ? 'stale' : row.status;
}

export interface BrokerPlanAssessment {
  status: 'unavailable' | 'blocked' | 'review';
  reason: string;
  quoteEntry: number | null;
  spread: number | null;
  entryDriftR: number | null;
  riskReward: number | null;
}

/** Informational only. A candle candidate is not an executable broker order. */
export function assessBrokerPlan(row: AdvancedSignal, now: number): BrokerPlanAssessment {
  const result: BrokerPlanAssessment = { status: 'unavailable', reason: '', quoteEntry: null, spread: null, entryDriftR: null, riskReward: null };
  if (row.source.kind !== 'broker' || row.source.isProxy) return { ...result, reason: 'Tidak ada bid/ask broker dari sumber yang sama.' };
  if (effectiveSignalStatus(row, now) !== 'candidate' || !row.plan) return { ...result, reason: 'Hanya kandidat dengan data segar yang dapat dibandingkan; skenario belum mengizinkan entry.' };
  const { bid, ask, quoteTime, capturedAt, validUntil } = row.source;
  const quote = Date.parse(quoteTime ?? ''), captured = Date.parse(capturedAt ?? ''), declaredExpiry = Date.parse(validUntil ?? '');
  if (![quote, captured, declaredExpiry].every(Number.isFinite) || quote > now + 30_000 || captured > now + 30_000
    || now >= Math.min(quote + 180_000, captured + 180_000, declaredExpiry)) return { ...result, reason: 'Quote broker hilang, invalid, atau sudah kedaluwarsa. Muat ulang.' };
  const plan = row.plan, buy = plan.side === 'buy', direction = buy ? 1 : -1;
  if ((plan.side !== 'buy' && plan.side !== 'sell') || ![bid, ask, plan.entry, plan.stopLoss, plan.takeProfit].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
    || ask! < bid!) return { ...result, reason: 'Bid/ask atau level harga invalid; tidak dihitung sebagai kesempatan entry.' };
  const originalRisk = direction * (plan.entry - plan.stopLoss), originalReward = direction * (plan.takeProfit - plan.entry);
  if (!(originalRisk > 0 && originalReward > 0)) return { ...result, reason: 'Urutan entry/SL/TP invalid.' };
  // CFD BUY enters at Ask and its stops trigger at Bid; SELL is the inverse.
  const entry = buy ? ask! : bid!, exitQuote = buy ? bid! : ask!;
  result.quoteEntry = entry; result.spread = ask! - bid!;
  result.entryDriftR = direction * (entry - plan.entry) / originalRisk;
  const risk = direction * (entry - plan.stopLoss), reward = direction * (plan.takeProfit - entry);
  if (direction * (exitQuote - plan.stopLoss) <= 0 || direction * (plan.takeProfit - exitQuote) <= 0 || risk <= 0 || reward <= 0) {
    return { ...result, status: 'blocked', reason: 'Quote sudah mencapai/melewati SL atau TP1 referensi. Jangan memakai setup lama; pindai ulang.' };
  }
  result.riskReward = reward / risk;
  if (!Number.isFinite(result.riskReward) || !Number.isFinite(result.entryDriftR)) return { ...result, status: 'blocked', riskReward: null, entryDriftR: null, reason: 'Perhitungan risiko tidak valid.' };
  if (result.riskReward < 1.5 - 1e-8) return { ...result, status: 'blocked', reason: 'R:R pada quote broker sudah di bawah 1,5R, batas awal model. Jangan mengejar entry referensi.' };
  return { ...result, status: 'review', reason: 'Geometri SL/TP masih muat pada snapshot ini; bukan izin entry. Validasi ulang harga terminal, biaya, lot, margin, berita dan batas broker.' };
}
