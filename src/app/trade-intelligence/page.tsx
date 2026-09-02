'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Coins,
  Database,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { PerformanceChart } from '@/components/trade-intelligence/performance-chart';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  PerformanceSummary,
  RobotTradeRecord,
  TradeInsight,
  TradeIntelligenceReport,
} from '@/lib/trade-intelligence/analytics';
import { cn } from '@/lib/utils';

type Range = '30' | '90' | '365' | 'all';

interface ApiPayload {
  report: TradeIntelligenceReport;
  trades: RobotTradeRecord[];
  lastSyncedAt: string | null;
}

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: '30', label: '30 hari' },
  { value: '90', label: '90 hari' },
  { value: '365', label: '1 tahun' },
  { value: 'all', label: 'Semua' },
];

function money(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function ratio(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 3_600) return `${Math.round(seconds / 60)} mnt`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} jam`;
  return `${(seconds / 86_400).toFixed(1)} hari`;
}

function isApiPayload(value: unknown): value is ApiPayload {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.report === 'object' && row.report !== null && Array.isArray(row.trades);
}

function SummaryTable({ rows, emptyLabel }: { rows: PerformanceSummary[]; emptyLabel: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kelompok</TableHead>
          <TableHead className="text-right">Trade</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
          <TableHead className="text-right">Expectancy</TableHead>
          <TableHead className="text-right">PF</TableHead>
          <TableHead className="text-right">Net P/L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{row.trades}</TableCell>
            <TableCell className="text-right tabular-nums">{percent(row.winRate)}</TableCell>
            <TableCell className={cn('text-right tabular-nums', (row.expectancy ?? 0) < 0 && 'text-red-500')}>
              {money(row.expectancy)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{ratio(row.profitFactor)}</TableCell>
            <TableCell className={cn('text-right font-medium tabular-nums', row.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {money(row.netProfit)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const INSIGHT_STYLE: Record<TradeInsight['severity'], string> = {
  positive: 'border-emerald-500/25 bg-emerald-500/8',
  watch: 'border-amber-500/25 bg-amber-500/8',
  risk: 'border-red-500/25 bg-red-500/8',
  info: 'border-blue-500/25 bg-blue-500/8',
};

export default function TradeIntelligencePage() {
  const [range, setRange] = useState<Range>('90');
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/trade-intelligence?range=${range}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload: unknown = await response.json().catch(() => null);
      const row = typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        setMigrationRequired(typeof row.migrationRequired === 'string' ? row.migrationRequired : null);
        throw new Error(typeof row.error === 'string' ? row.error : `HTTP ${response.status}`);
      }
      if (!isApiPayload(payload)) throw new Error('Respons analitik tidak valid.');
      setData(payload);
      setError(null);
      setMigrationRequired(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analitik trade gagal dimuat.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const initial = globalThis.setTimeout(() => void refresh(), 0);
    const interval = globalThis.setInterval(() => void refresh(true), 60_000);
    return () => {
      globalThis.clearTimeout(initial);
      globalThis.clearInterval(interval);
    };
  }, [refresh]);

  const metricCards = useMemo(() => {
    const metrics = data?.report.metrics;
    return [
      { label: 'Net P/L', value: money(metrics?.netProfit ?? null), detail: `${data?.report.sample.closedTrades ?? 0} posisi tertutup`, tone: (metrics?.netProfit ?? 0) >= 0 ? 'good' : 'bad' },
      { label: 'Win rate', value: percent(metrics?.winRate ?? null), detail: `${metrics?.wins ?? 0} win · ${metrics?.losses ?? 0} loss`, tone: 'neutral' },
      { label: 'Expectancy / trade', value: money(metrics?.expectancy ?? null), detail: 'Sudah termasuk biaya', tone: (metrics?.expectancy ?? 0) >= 0 ? 'good' : 'bad' },
      { label: 'Profit factor', value: ratio(metrics?.profitFactor ?? null), detail: 'Gross win ÷ gross loss', tone: (metrics?.profitFactor ?? 0) >= 1 ? 'good' : 'bad' },
      { label: 'Max drawdown', value: money(metrics?.maxDrawdown ?? null), detail: `Loss streak maks. ${metrics?.maxConsecutiveLosses ?? 0}`, tone: 'bad' },
      { label: 'Biaya trading', value: money(metrics?.totalCosts ?? null), detail: `Durasi rata-rata ${duration(metrics?.averageDurationSeconds ?? null)}`, tone: 'neutral' },
    ];
  }, [data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-xl md:p-8">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-sm text-indigo-200">
                <BrainCircuit className="h-5 w-5" />
                Evaluasi otomatis hasil aktual MT5
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Trade Intelligence</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
                Menghubungkan entry–exit robot, biaya, drawdown, dan kegagalan antrean agar setiap loss
                menjadi bahan review yang terukur. Analisis ini tidak mengubah risiko atau strategi secara otomatis.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-white/8 p-1 ring-1 ring-white/15">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRange(option.value)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      range === option.value ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                Sinkronkan
              </Button>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm sm:flex-row sm:items-start">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Gunakan sebagai alat evaluasi, bukan mesin jaminan profit</p>
            <p className="mt-1 text-muted-foreground">
              Jangan menaikkan lot berdasarkan beberapa hasil awal. Idealnya kumpulkan 20–50 trade demo,
              lalu validasi perubahan lewat backtest dan forward-test terpisah.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold text-red-500">Data evaluasi belum tersedia</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
                {migrationRequired && (
                  <p className="mt-2">Jalankan migration <code className="rounded bg-muted px-1 py-0.5 text-xs">{migrationRequired}</code>.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map((metric) => (
            <Card key={metric.label} className="xl:col-span-1">
              <CardHeader className="pb-1">
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className={cn(
                  'text-2xl tabular-nums',
                  metric.tone === 'good' && 'text-emerald-500',
                  metric.tone === 'bad' && 'text-red-500',
                )}>
                  {metric.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{metric.detail}</CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Kurva hasil & drawdown</CardTitle>
              <CardDescription>P/L kumulatif dalam mata uang akun, diurutkan berdasarkan waktu exit.</CardDescription>
            </CardHeader>
            <CardContent><PerformanceChart data={data?.report.equityCurve ?? []} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" />Diagnosis prioritas</CardTitle>
              <CardDescription>
                {data?.report.sample.qualityLabel ?? 'Menunggu sinkronisasi riwayat'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.report.insights ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Belum ada diagnosis. Sistem akan menilai posisi yang sudah tertutup.
                </div>
              ) : data?.report.insights.map((insight) => (
                <div key={insight.id} className={cn('rounded-xl border p-3', INSIGHT_STYLE[insight.severity])}>
                  <p className="font-semibold">{insight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.detail}</p>
                  <p className="mt-2 text-xs"><span className="font-semibold">Review:</span> {insight.action}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-blue-500" />Performa per simbol</CardTitle>
              <CardDescription>Kelompok dengan minimal tiga trade baru dipakai untuk diagnosis kelemahan.</CardDescription>
            </CardHeader>
            <CardContent><SummaryTable rows={data?.report.bySymbol ?? []} emptyLabel="Belum ada data simbol." /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-violet-500" />Performa per strategi</CardTitle>
              <CardDescription>Bandingkan robot crypto dan forex dari hasil bersih aktual.</CardDescription>
            </CardHeader>
            <CardContent><SummaryTable rows={data?.report.byStrategy ?? []} emptyLabel="Belum ada data strategi." /></CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-amber-500" />Kegagalan antrean crypto</CardTitle>
              <CardDescription>{data?.report.sample.queueIncidents ?? 0} intent diperiksa pada rentang ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.report.failures ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Tidak ada kegagalan untuk dirangkum.</p>
              ) : data?.report.failures.map((failure) => (
                <div key={failure.key} className="flex items-center justify-between gap-4 rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-medium">{failure.label}</p>
                    <p className="text-xs text-muted-foreground">{failure.share.toFixed(1)}% dari kegagalan</p>
                  </div>
                  <Badge variant="outline">{failure.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" />Trade tertutup terbaru</CardTitle>
              <CardDescription>
                Sinkronisasi terakhir: {data?.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString('id-ID') : 'belum pernah'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exit</TableHead><TableHead>Simbol</TableHead><TableHead>Sisi</TableHead>
                    <TableHead>Alasan</TableHead><TableHead>Durasi</TableHead><TableHead className="text-right">Net P/L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.trades ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Menunggu posisi robot pertama ditutup dan disinkronkan.</TableCell></TableRow>
                  ) : data?.trades.slice(0, 25).map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="text-xs">{new Date(trade.exitTime).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={trade.side === 'buy' ? 'text-emerald-500' : 'text-red-500'}>{trade.side.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>{trade.exitReason}</TableCell>
                      <TableCell>{duration(trade.durationSeconds)}</TableCell>
                      <TableCell className={cn('text-right font-semibold tabular-nums', trade.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {trade.netProfit >= 0 ? <TrendingUp className="mr-1 inline h-3.5 w-3.5" /> : <TrendingDown className="mr-1 inline h-3.5 w-3.5" />}
                        {money(trade.netProfit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <p>Data akun MT5 disimpan dengan identitas akun yang di-hash. Nomor login dan kredensial broker tidak dikirim ke database.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
