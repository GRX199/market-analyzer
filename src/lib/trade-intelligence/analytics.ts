export interface RobotTradeRecord {
  id: string;
  accountRef?: string;
  strategy: string;
  marketType: 'crypto' | 'forex';
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  initialStopLoss: number | null;
  initialTakeProfit: number | null;
  grossProfit: number;
  commission: number;
  swap: number;
  fee: number;
  netProfit: number;
  durationSeconds: number;
  exitReason: string;
  entryComment: string | null;
  syncedAt: string;
}

export interface QueueIncidentRecord {
  id: string;
  symbol: string;
  action: 'buy' | 'sell';
  status: string;
  createdAt: string;
  errorMessage: string | null;
}

export interface PerformanceSummary {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netProfit: number;
  expectancy: number | null;
  profitFactor: number | null;
  averageWin: number | null;
  averageLoss: number | null;
}

export interface EquityPoint {
  time: string;
  cumulativeProfit: number;
  drawdown: number;
  symbol: string;
}

export interface FailureCategory {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface TradeInsight {
  id: string;
  severity: 'positive' | 'watch' | 'risk' | 'info';
  title: string;
  detail: string;
  action: string;
}

export interface TradeIntelligenceReport {
  generatedAt: string;
  sample: {
    closedTrades: number;
    queueIncidents: number;
    quality: 'empty' | 'preliminary' | 'developing' | 'usable';
    qualityLabel: string;
  };
  metrics: {
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number | null;
    netProfit: number;
    grossWins: number;
    grossLosses: number;
    profitFactor: number | null;
    expectancy: number | null;
    payoffRatio: number | null;
    maxDrawdown: number;
    maxConsecutiveLosses: number;
    totalCosts: number;
    averageDurationSeconds: number | null;
  };
  equityCurve: EquityPoint[];
  bySymbol: PerformanceSummary[];
  byStrategy: PerformanceSummary[];
  byExitHourUtc: PerformanceSummary[];
  failures: FailureCategory[];
  insights: TradeInsight[];
}

const MONEY_EPSILON = 1e-9;

export function strategyLabel(key: string): string {
  return ({ crypto_scalper: 'Crypto M1 lama', crypto_broker_h1: 'Crypto BTC H1',
    forex_stable_h1: 'Forex H1', forex_aggressive_m15: 'Forex M15 agresif',
    forex_legacy_unknown: 'Forex lama / profil belum terverifikasi',
    forex_pullback_m15: 'Forex pullback lama' } as Record<string, string>)[key] ?? key;
}

function rounded(value: number, precision = 8): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function summarize(
  key: string,
  label: string,
  trades: RobotTradeRecord[],
): PerformanceSummary {
  const wins = trades.filter((trade) => trade.netProfit > MONEY_EPSILON);
  const losses = trades.filter((trade) => trade.netProfit < -MONEY_EPSILON);
  const breakeven = trades.length - wins.length - losses.length;
  const decided = wins.length + losses.length;
  const grossWins = wins.reduce((sum, trade) => sum + trade.netProfit, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.netProfit, 0));
  const netProfit = trades.reduce((sum, trade) => sum + trade.netProfit, 0);

  return {
    key,
    label,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: decided > 0 ? rounded((wins.length / decided) * 100, 4) : null,
    netProfit: rounded(netProfit),
    expectancy: trades.length > 0 ? rounded(netProfit / trades.length) : null,
    profitFactor: grossLosses > MONEY_EPSILON
      ? rounded(grossWins / grossLosses, 6)
      : wins.length > 0 ? null : 0,
    averageWin: wins.length > 0 ? rounded(grossWins / wins.length) : null,
    averageLoss: losses.length > 0 ? rounded(-grossLosses / losses.length) : null,
  };
}

function groupSummaries(
  trades: RobotTradeRecord[],
  keyFor: (trade: RobotTradeRecord) => string,
  labelFor: (key: string) => string = (key) => key,
): PerformanceSummary[] {
  const groups = new Map<string, RobotTradeRecord[]>();
  for (const trade of trades) {
    const key = keyFor(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => summarize(key, labelFor(key), group))
    .sort((left, right) => right.trades - left.trades || left.key.localeCompare(right.key));
}

export function categorizeQueueFailure(message: string | null): string {
  const normalized = message?.trim().toLowerCase() ?? '';
  if (!normalized) return 'unknown';
  if (normalized.includes('stale') || normalized.includes('future-dated')) return 'stale_signal';
  if (normalized.includes('m5/m15') || normalized.includes('alignment')) return 'mtf_filter';
  if (normalized.includes('spread')) return 'spread_guard';
  if (normalized.includes('cooldown')) return 'cooldown';
  if (
    normalized.includes('risk')
    || normalized.includes('volume')
    || normalized.includes('daily loss')
    || normalized.includes('exposure')
  ) return 'risk_guard';
  if (normalized.includes('quote') || normalized.includes('market data')) return 'market_data';
  if (
    normalized.includes('position')
    || normalized.includes('pending order')
    || normalized.includes('already processed')
  ) return 'duplicate_exposure';
  if (normalized.includes('symbol')) return 'symbol_mapping';
  return 'other';
}

const FAILURE_LABELS: Record<string, string> = {
  stale_signal: 'Sinyal kedaluwarsa',
  mtf_filter: 'Ditolak filter MTF',
  spread_guard: 'Spread terlalu lebar',
  cooldown: 'Cooldown aktif',
  risk_guard: 'Batas risiko/volume',
  market_data: 'Data pasar/quote',
  duplicate_exposure: 'Posisi/eksposur sudah ada',
  symbol_mapping: 'Pemetaan simbol',
  other: 'Kegagalan lainnya',
  unknown: 'Tanpa keterangan',
};

function failureBreakdown(incidents: QueueIncidentRecord[]): FailureCategory[] {
  const failed = incidents.filter((incident) => incident.status === 'failed');
  const counts = new Map<string, number>();
  for (const incident of failed) {
    const category = categorizeQueueFailure(incident.errorMessage);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: FAILURE_LABELS[key] ?? key,
      count,
      share: failed.length > 0 ? rounded((count / failed.length) * 100, 2) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function sampleQuality(count: number): TradeIntelligenceReport['sample'] {
  if (count === 0) {
    return {
      closedTrades: 0,
      queueIncidents: 0,
      quality: 'empty',
      qualityLabel: 'Belum ada transaksi tertutup',
    };
  }
  if (count < 20) {
    return {
      closedTrades: count,
      queueIncidents: 0,
      quality: 'preliminary',
      qualityLabel: 'Sampel awal — jangan ubah strategi dulu',
    };
  }
  if (count < 50) {
    return {
      closedTrades: count,
      queueIncidents: 0,
      quality: 'developing',
      qualityLabel: 'Sampel berkembang — validasi dengan forward-test',
    };
  }
  return {
    closedTrades: count,
    queueIncidents: 0,
    quality: 'usable',
    qualityLabel: 'Sampel cukup untuk diagnosis awal',
  };
}

function buildInsights(
  overall: PerformanceSummary,
  metrics: TradeIntelligenceReport['metrics'],
  bySymbol: PerformanceSummary[],
  byHour: PerformanceSummary[],
  failures: FailureCategory[],
  sample: TradeIntelligenceReport['sample'],
): TradeInsight[] {
  const insights: TradeInsight[] = [];
  if (sample.quality === 'empty') {
    insights.push({
      id: 'no-history',
      severity: 'info',
      title: 'Menunggu posisi MT5 tertutup',
      detail: 'Analisis hasil membutuhkan entry dan exit aktual, bukan hanya sinyal atau order yang baru dibuka.',
      action: 'Biarkan sinkronisasi aktif dan kumpulkan transaksi demo tanpa mengubah parameter terlalu cepat.',
    });
  } else if (sample.quality === 'preliminary') {
    insights.push({
      id: 'small-sample',
      severity: 'watch',
      title: 'Sampel masih terlalu kecil',
      detail: `${sample.closedTrades} transaksi tertutup mudah dipengaruhi keberuntungan dan satu loss besar.`,
      action: 'Kumpulkan sedikitnya 20–50 transaksi demo sebelum menilai perubahan strategi.',
    });
  }

  if (overall.trades > 0 && (overall.expectancy ?? 0) < 0) {
    insights.push({
      id: 'negative-expectancy',
      severity: 'risk',
      title: 'Expectancy sampel negatif',
      detail: `Rata-rata hasil per transaksi ${rounded(overall.expectancy ?? 0, 4)} dalam mata uang akun.`,
      action: 'Jangan menaikkan risiko; review simbol, jam, spread, dan alasan exit dengan sampel tambahan.',
    });
  } else if (overall.trades >= 20 && (overall.expectancy ?? 0) > 0) {
    insights.push({
      id: 'positive-expectancy',
      severity: 'positive',
      title: 'Expectancy sementara positif',
      detail: `Rata-rata hasil per transaksi ${rounded(overall.expectancy ?? 0, 4)} pada sampel ini.`,
      action: 'Pertahankan risiko tetap dan konfirmasi kestabilan pada periode pasar yang berbeda.',
    });
  }

  if (overall.losses > 0 && (overall.profitFactor ?? 0) < 1) {
    insights.push({
      id: 'profit-factor-below-one',
      severity: 'risk',
      title: 'Profit factor di bawah 1',
      detail: 'Total profit dari trade menang belum menutup total kerugian trade kalah.',
      action: 'Prioritaskan mengurangi setup terburuk, bukan mengejar win rate dengan target lebih kecil.',
    });
  }

  if (metrics.maxConsecutiveLosses >= 3) {
    insights.push({
      id: 'loss-streak',
      severity: 'watch',
      title: `Terjadi ${metrics.maxConsecutiveLosses} loss beruntun`,
      detail: 'Loss beruntun dapat menunjukkan perubahan regime atau filter entry yang terlalu longgar.',
      action: 'Bandingkan waktu dan simbol pada streak; uji aturan jeda setelah loss secara terpisah di demo.',
    });
  }

  const weakSymbol = bySymbol
    .filter((row) => row.trades >= 3 && (row.expectancy ?? 0) < 0)
    .sort((left, right) => (left.expectancy ?? 0) - (right.expectancy ?? 0))[0];
  if (weakSymbol) {
    insights.push({
      id: `weak-symbol-${weakSymbol.key}`,
      severity: 'watch',
      title: `${weakSymbol.label} perlu direview`,
      detail: `${weakSymbol.trades} trade dengan expectancy ${rounded(weakSymbol.expectancy ?? 0, 4)}.`,
      action: 'Forward-test simbol ini terpisah sebelum memutuskan untuk memblokir atau mengubah parameternya.',
    });
  }

  const weakHour = byHour
    .filter((row) => row.trades >= 3 && (row.expectancy ?? 0) < 0)
    .sort((left, right) => (left.expectancy ?? 0) - (right.expectancy ?? 0))[0];
  if (weakHour) {
    insights.push({
      id: `weak-hour-${weakHour.key}`,
      severity: 'watch',
      title: `Jam exit ${weakHour.label} memiliki hasil lemah`,
      detail: `${weakHour.trades} trade dengan expectancy ${rounded(weakHour.expectancy ?? 0, 4)}. Ini korelasi, bukan bukti penyebab.`,
      action: 'Periksa spread, rollover, berita, dan jam entry sebelum menambahkan filter waktu.',
    });
  }

  const topFailure = failures[0];
  if (topFailure?.key === 'stale_signal' && topFailure.count >= 3) {
    insights.push({
      id: 'stale-queue',
      severity: 'watch',
      title: 'Banyak intent kedaluwarsa',
      detail: `${topFailure.count} intent (${topFailure.share.toFixed(0)}%) ditolak karena terlambat diproses.`,
      action: 'Pastikan dashboard API dan robot lokal aktif sebelum meng-arming robot crypto.',
    });
  }

  if (metrics.totalCosts > 0 && metrics.grossWins > 0 && metrics.totalCosts / metrics.grossWins >= 0.25) {
    insights.push({
      id: 'cost-drag',
      severity: 'watch',
      title: 'Biaya perlu diperhatikan',
      detail: `Komisi, swap, dan fee bersih setara ${rounded((metrics.totalCosts / metrics.grossWins) * 100, 2)}% dari hasil bersih trade menang. Spread sudah tercermin pada harga fill, bukan biaya terpisah di sini.`,
      action: 'Review frekuensi entry, spread, dan durasi posisi; jangan mengabaikan biaya dalam backtest.',
    });
  }

  return insights.slice(0, 8);
}

export function analyzeTradeHistory(
  trades: RobotTradeRecord[],
  incidents: QueueIncidentRecord[],
  generatedAt = new Date().toISOString(),
): TradeIntelligenceReport {
  const sorted = [...trades].sort(
    (left, right) => Date.parse(left.exitTime) - Date.parse(right.exitTime),
  );
  const overall = summarize('all', 'Semua strategi', sorted);
  let cumulativeProfit = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let currentLossStreak = 0;
  let maxConsecutiveLosses = 0;
  const equityCurve: EquityPoint[] = [];

  for (const trade of sorted) {
    cumulativeProfit += trade.netProfit;
    peak = Math.max(peak, cumulativeProfit);
    const drawdown = Math.max(0, peak - cumulativeProfit);
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    if (trade.netProfit < -MONEY_EPSILON) {
      currentLossStreak += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    } else if (trade.netProfit > MONEY_EPSILON) {
      currentLossStreak = 0;
    }
    equityCurve.push({
      time: trade.exitTime,
      cumulativeProfit: rounded(cumulativeProfit),
      drawdown: rounded(drawdown),
      symbol: trade.symbol,
    });
  }

  const averageWin = overall.averageWin;
  const averageLoss = overall.averageLoss;
  const grossWins = sorted
    .filter((trade) => trade.netProfit > MONEY_EPSILON)
    .reduce((sum, trade) => sum + trade.netProfit, 0);
  const grossLosses = Math.abs(sorted
    .filter((trade) => trade.netProfit < -MONEY_EPSILON)
    .reduce((sum, trade) => sum + trade.netProfit, 0));
  const totalCosts = Math.max(0, -sorted.reduce(
    (sum, trade) => sum + trade.commission + trade.swap + trade.fee,
    0,
  ));
  const bySymbol = groupSummaries(sorted, (trade) => trade.symbol);
  const byStrategy = groupSummaries(
    sorted,
    (trade) => trade.strategy,
    strategyLabel,
  );
  const byExitHourUtc = groupSummaries(
    sorted,
    (trade) => String(new Date(trade.exitTime).getUTCHours()).padStart(2, '0'),
    (key) => `${key}:00 UTC`,
  );
  const failures = failureBreakdown(incidents);
  const sample = {
    ...sampleQuality(sorted.length),
    queueIncidents: incidents.length,
  };
  const metrics: TradeIntelligenceReport['metrics'] = {
    wins: overall.wins,
    losses: overall.losses,
    breakeven: overall.breakeven,
    winRate: overall.winRate,
    netProfit: overall.netProfit,
    grossWins: rounded(grossWins),
    grossLosses: rounded(grossLosses),
    profitFactor: overall.profitFactor,
    expectancy: overall.expectancy,
    payoffRatio: averageWin !== null && averageLoss !== null && averageLoss < 0
      ? rounded(averageWin / Math.abs(averageLoss), 6)
      : null,
    maxDrawdown: rounded(maxDrawdown),
    maxConsecutiveLosses,
    totalCosts: rounded(totalCosts),
    averageDurationSeconds: sorted.length > 0
      ? rounded(sorted.reduce((sum, trade) => sum + trade.durationSeconds, 0) / sorted.length, 2)
      : null,
  };

  return {
    generatedAt,
    sample,
    metrics,
    equityCurve,
    bySymbol,
    byStrategy,
    byExitHourUtc,
    failures,
    insights: buildInsights(overall, metrics, bySymbol, byExitHourUtc, failures, sample),
  };
}
