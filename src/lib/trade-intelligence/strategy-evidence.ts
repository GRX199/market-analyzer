import type { RobotTradeRecord } from './analytics';

// Review policy, not a statistical proof or an automatic trading permission.
export const EVIDENCE_POLICY = { minimumTrades: 60, minimumDays: 84, minimumProfitFactor: 1.2, recentTrades: 20 };

export const CURRENT_PROFILES = [
  { id: 'btc-h1', label: 'BTC · H1 recovery', strategy: 'crypto_broker_h1', symbol: 'BTCUSDm', marker: 'ctpull1', market: 'crypto', since: '2026-09-05T00:00:00Z' },
  { id: 'xau-h1', label: 'XAU · H1 breakout', strategy: 'forex_stable_h1', symbol: 'XAUUSDm', marker: 'fxbreak', market: 'forex', since: '2026-09-03T00:00:00Z' },
  { id: 'eurjpy-h1', label: 'EURJPY · H1 recovery', strategy: 'forex_stable_h1', symbol: 'EURJPYm', marker: 'fxpull', market: 'forex', since: '2026-09-03T00:00:00Z' },
  { id: 'xau-m15', label: 'XAU · M15 agresif', strategy: 'forex_aggressive_m15', symbol: 'XAUUSDm', marker: 'fxm15', market: 'forex', since: '2026-09-05T00:00:00Z' },
] as const;

export interface StrategyEvidence {
  id: string;
  label: string;
  symbol: string;
  status: 'empty' | 'collecting' | 'review' | 'review_candidate';
  trades: number;
  observedDays: number;
  netProfit: number;
  expectancy: number | null;
  profitFactor: number | null;
  recentExpectancy: number | null;
  netWithoutBestTrade: number | null;
  missingProtection: number;
  reasons: string[];
  operationalEvidence: 'unverified';
  realMoneyUnlocked: false;
}

function netMetrics(trades: RobotTradeRecord[]) {
  const netProfit = trades.reduce((sum, trade) => sum + trade.netProfit, 0);
  const gains = trades.reduce((sum, trade) => sum + Math.max(0, trade.netProfit), 0);
  const losses = trades.reduce((sum, trade) => sum + Math.max(0, -trade.netProfit), 0);
  return { netProfit, expectancy: trades.length ? netProfit / trades.length : null,
    profitFactor: losses > 0 ? gains / losses : null };
}

export function evaluateStrategyEvidence(
  trades: RobotTradeRecord[],
  accountRef: string | null,
  incomplete = false,
  asOf = Date.now(),
): StrategyEvidence[] {
  const validEvaluationTime = Number.isFinite(asOf) && Number.isFinite(new Date(asOf).getTime());
  return CURRENT_PROFILES.map((profile) => {
    const matchingRows = trades.filter((trade) => accountRef !== null && trade.accountRef === accountRef
      && trade.strategy === profile.strategy && trade.symbol.toUpperCase() === profile.symbol.toUpperCase()
      && trade.marketType === profile.market && trade.entryComment?.split(':')[0] === profile.marker
    );
    const invalidRows = matchingRows.filter((trade) => {
      const entry = Date.parse(trade.entryTime);
      const exit = Date.parse(trade.exitTime);
      return !validEvaluationTime || !Number.isFinite(entry) || !Number.isFinite(exit)
        || exit < entry || exit > asOf || !Number.isFinite(trade.netProfit);
    });
    const invalidRecords = new Set(invalidRows);
    const rows = matchingRows.filter((trade) => !invalidRecords.has(trade)
      && Date.parse(trade.entryTime) >= Date.parse(profile.since)
    ).sort((a, b) => Date.parse(a.exitTime) - Date.parse(b.exitTime) || a.id.localeCompare(b.id));
    const metrics = netMetrics(rows);
    const recent = rows.slice(-EVIDENCE_POLICY.recentTrades);
    const observedDays = rows.length ? Math.floor((Math.max(...rows.map(t => Date.parse(t.exitTime)))
      - Math.min(...rows.map(t => Date.parse(t.entryTime)))) / 86_400_000) : 0;
    const missingProtection = rows.filter(t => !(t.initialStopLoss && t.initialStopLoss > 0)
      || !(t.initialTakeProfit && t.initialTakeProfit > 0)).length;
    const recentExpectancy = recent.length === EVIDENCE_POLICY.recentTrades ? netMetrics(recent).expectancy : null;
    const netWithoutBestTrade = rows.length ? metrics.netProfit - Math.max(...rows.map(t => t.netProfit)) : null;
    const reasons: string[] = [];
    if (incomplete) reasons.push('Riwayat dibatasi atau ada data tidak valid; evaluasi belum lengkap.');
    if (!validEvaluationTime) reasons.push('Waktu evaluasi tidak valid; bukti transaksi belum dapat dinilai.');
    if (invalidRows.length) reasons.push(`${invalidRows.length} trade dengan waktu/hasil tidak valid atau tanggal masa depan dikeluarkan; review data diperlukan.`);
    if (rows.length < EVIDENCE_POLICY.minimumTrades) reasons.push(`${rows.length}/${EVIDENCE_POLICY.minimumTrades} posisi tertutup yang cocok dengan profil.`);
    if (observedDays < EVIDENCE_POLICY.minimumDays) reasons.push(`${observedDays}/${EVIDENCE_POLICY.minimumDays} hari rentang observasi entry–exit; bukan bukti uptime.`);
    if (missingProtection) reasons.push(`${missingProtection} trade tanpa catatan SL/TP awal lengkap; periksa histori broker.`);
    if (rows.some(t => t.exitReason === 'stop_out')) reasons.push('Terdapat stop-out; review margin dan risiko diperlukan.');
    if (rows.length && (metrics.expectancy ?? 0) <= 0) reasons.push('Expectancy bersih sampel belum positif.');
    if (rows.length && (metrics.profitFactor === null || metrics.profitFactor < EVIDENCE_POLICY.minimumProfitFactor)) {
      reasons.push(metrics.profitFactor === null ? 'Belum ada trade rugi untuk menghitung PF; bukan otomatis lolos.' : 'Profit factor bersih di bawah 1,20.');
    }
    if (recentExpectancy !== null && recentExpectancy <= 0) reasons.push('Rata-rata 20 trade terakhir tidak positif.');
    if (netWithoutBestTrade !== null && netWithoutBestTrade <= 0) reasons.push('Hasil belum tahan jika satu trade terbaik dikeluarkan.');
    const riskFlag = incomplete || !validEvaluationTime || invalidRows.length > 0
      || missingProtection > 0 || rows.some(t => t.exitReason === 'stop_out')
      || (rows.length >= 20 && ((metrics.expectancy ?? 0) <= 0 || (recentExpectancy ?? 0) <= 0));
    const status = riskFlag ? 'review' : rows.length === 0 ? 'empty' : reasons.length ? 'collecting' : 'review_candidate';
    if (!reasons.length) reasons.push('Memenuhi penyaringan hasil tertutup untuk review manual; jangan otomatis menaikkan lot.');
    reasons.push('Versi parameter, drawdown floating, uptime dan kepatuhan guard belum dapat dibuktikan dari histori ini.');
    return { id: profile.id, label: profile.label, symbol: profile.symbol, status, trades: rows.length,
      observedDays, ...metrics, recentExpectancy, netWithoutBestTrade, missingProtection, reasons,
      operationalEvidence: 'unverified', realMoneyUnlocked: false };
  });
}
