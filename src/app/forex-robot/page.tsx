'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BrokerRuntimeNotice } from '@/components/trading/broker-runtime-notice';

type ForexPreviewSignal = 'buy' | 'sell' | 'wait' | 'unavailable';
type ForexPreviewTrend = 'bullish' | 'bearish' | 'neutral';
type ForexStrategyMode = 'stable_h1' | 'aggressive_m15';

interface ForexPreviewRow {
  symbol: string;
  name: string;
  signal: ForexPreviewSignal;
  trend?: ForexPreviewTrend;
  price?: number;
  ema50?: number;
  ema200?: number;
  emaSeparationAtr?: number;
  breakoutHigh?: number;
  breakoutLow?: number;
  rsi?: number;
  previousRsi?: number;
  atr?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  lastClosedAt?: string;
  reason: string;
}

interface ForexPreview {
  scannedAt: string;
  strategyMode: ForexStrategyMode;
  timeframe: '1H' | '15m';
  source: string;
  rows: ForexPreviewRow[];
}

const STRATEGY_DETAILS: Record<ForexStrategyMode, {
  label: string;
  shortLabel: string;
  timeframe: string;
  badge: string;
  description: string;
  launcher: string;
  riskCap: string;
  rules: [string, string, string][];
}> = {
  stable_h1: {
    label: 'Stable H1',
    shortLabel: 'STABLE',
    timeframe: 'H1',
    badge: 'EMA 50/200 · Donchian 20',
    description: 'Mode selektif XAUUSD dan EURJPY H1. Nama Stable bukan jaminan kestabilan hasil; EURJPY memerlukan review biaya.',
    launcher: 'run_demo_stable_h1.bat',
    riskCap: '0,25%',
    rules: [
      ['1', 'Candle final H1', 'Candle yang masih berjalan tidak digunakan untuk membuat sinyal.'],
      ['2', 'Filter tren dan slope EMA', 'BUY memerlukan EMA 50 > EMA 200 dan EMA 50 naik; SELL adalah kebalikannya.'],
      ['3', 'Breakout Donchian 20', 'Preview XAU entry hanya saat close menembus high/low 20 candle sebelumnya.'],
      ['4', 'Validasi broker & risiko', 'Spread, quote, posisi, cooldown, daily loss, dan open risk diperiksa di MT5.'],
    ],
  },
  aggressive_m15: {
    label: 'Aggressive M15',
    shortLabel: 'AGGRESSIVE',
    timeframe: 'M15',
    badge: 'EMA 50/200 · RSI recovery',
    description: 'Lebih sering mencari peluang XAUUSD M15, dengan risiko per transaksi yang lebih kecil.',
    launcher: 'run_demo_aggressive_m15.bat',
    riskCap: '0,15%',
    rules: [
      ['1', 'Candle final M15', 'Sinyal hanya dihitung sekali setelah candle 15 menit benar-benar selesai.'],
      ['2', 'Tren kuat EMA 50/200', 'Arah EMA, slope empat candle, dan jarak minimal 0,50 ATR wajib sejalan.'],
      ['3', 'RSI recovery 45/55', 'Entry memerlukan RSI menyeberang kembali dari pullback dan warna candle mendukung.'],
      ['4', 'SL 2 ATR · TP 2R', 'Satu posisi XAU maksimum, cooldown dua candle, dan risk cap 0,15% per transaksi.'],
    ],
  },
};

function finiteOptional(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePreview(value: unknown): ForexPreview | null {
  if (typeof value !== 'object' || value === null) return null;
  const root = value as Record<string, unknown>;
  const data = typeof root.data === 'object' && root.data !== null
    ? root.data as Record<string, unknown>
    : null;
  if (
    !data
    || typeof data.scannedAt !== 'string'
    || !['stable_h1', 'aggressive_m15'].includes(String(data.strategyMode))
    || !['1H', '15m'].includes(String(data.timeframe))
    || !Array.isArray(data.rows)
  ) return null;

  const rows = data.rows.flatMap((candidate): ForexPreviewRow[] => {
    if (typeof candidate !== 'object' || candidate === null) return [];
    const row = candidate as Record<string, unknown>;
    const signal = String(row.signal);
    if (
      typeof row.symbol !== 'string'
      || typeof row.name !== 'string'
      || typeof row.reason !== 'string'
      || !['buy', 'sell', 'wait', 'unavailable'].includes(signal)
    ) {
      return [];
    }
    const trend = ['bullish', 'bearish', 'neutral'].includes(String(row.trend))
      ? row.trend as ForexPreviewTrend
      : undefined;
    return [{
      symbol: row.symbol,
      name: row.name,
      signal: signal as ForexPreviewSignal,
      trend,
      price: finiteOptional(row.price),
      ema50: finiteOptional(row.ema50),
      ema200: finiteOptional(row.ema200),
      emaSeparationAtr: finiteOptional(row.emaSeparationAtr),
      breakoutHigh: finiteOptional(row.breakoutHigh),
      breakoutLow: finiteOptional(row.breakoutLow),
      rsi: finiteOptional(row.rsi),
      previousRsi: finiteOptional(row.previousRsi),
      atr: finiteOptional(row.atr),
      stopLoss: row.stopLoss === null ? null : finiteOptional(row.stopLoss),
      takeProfit: row.takeProfit === null ? null : finiteOptional(row.takeProfit),
      lastClosedAt: typeof row.lastClosedAt === 'string' ? row.lastClosedAt : undefined,
      reason: row.reason,
    }];
  });

  return {
    scannedAt: data.scannedAt,
    strategyMode: data.strategyMode as ForexStrategyMode,
    timeframe: data.timeframe as '1H' | '15m',
    source: typeof data.source === 'string' ? data.source : 'Provider website',
    rows,
  };
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = value >= 1000 ? 2 : value >= 10 ? 3 : value >= 1 ? 5 : 6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signalPresentation(signal: ForexPreviewSignal) {
  if (signal === 'buy') return { label: 'BUY', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  if (signal === 'sell') return { label: 'SELL', className: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' };
  if (signal === 'wait') return { label: 'WAIT', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  return { label: 'NO DATA', className: 'border-border bg-muted/50 text-muted-foreground' };
}

export default function ForexRobotPage() {
  const [strategyMode, setStrategyMode] = useState<ForexStrategyMode>('stable_h1');
  const [preview, setPreview] = useState<ForexPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (
    silent = false,
    requestedMode: ForexStrategyMode = strategyMode,
  ) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(`/api/forex-robot?mode=${encodeURIComponent(requestedMode)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const row = typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : {};
        throw new Error(typeof row.error === 'string' ? row.error : `HTTP ${response.status}`);
      }
      const parsed = parsePreview(payload);
      if (!parsed || parsed.strategyMode !== requestedMode) {
        throw new Error('Respons monitor Forex tidak sesuai mode yang dipilih.');
      }
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setPreview(parsed);
      setError(null);
    } catch (caughtError) {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setError(caughtError instanceof Error ? caughtError.message : 'Monitor Forex gagal dimuat.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [strategyMode]);

  useEffect(() => {
    const initialTimer = globalThis.setTimeout(() => void refresh(false), 0);
    const refreshInterval = globalThis.setInterval(() => void refresh(true), 5 * 60_000);
    return () => {
      globalThis.clearTimeout(initialTimer);
      globalThis.clearInterval(refreshInterval);
      requestRef.current?.abort();
    };
  }, [refresh]);

  const summary = useMemo(() => ({
    buy: preview?.rows.filter((row) => row.signal === 'buy').length ?? 0,
    sell: preview?.rows.filter((row) => row.signal === 'sell').length ?? 0,
    ready: preview?.rows.filter((row) => row.signal !== 'unavailable').length ?? 0,
  }), [preview]);

  const sortedRows = useMemo(() => [...(preview?.rows ?? [])].sort((left, right) => {
    const priority: Record<ForexPreviewSignal, number> = { buy: 0, sell: 0, wait: 1, unavailable: 2 };
    return priority[left.signal] - priority[right.signal];
  }), [preview]);
  const strategy = STRATEGY_DETAILS[strategyMode];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <BrokerRuntimeNotice market="forex" />
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.35),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.18),transparent_35%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="border-blue-300/20 bg-blue-400/15 text-blue-100">MT5 · {strategy.timeframe}</Badge>
                <Badge className="border-white/10 bg-white/5 text-slate-200">{strategy.badge}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Bot className="h-6 w-6 text-blue-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Robot Forex</h1>
                  <p className="mt-1 text-sm text-slate-300">Monitor {strategy.label} untuk runtime MT5 gabungan.</p>
                </div>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300">
                {strategy.description} Preview memakai candle final dari provider website. Robot menghitung ulang dari data broker MT5,
                memeriksa spread, posisi, cooldown, dan risiko akun sebelum menerima entry.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/operations" className={buttonVariants({ variant: 'outline', className: 'border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white' })}>
                <ServerCog className="h-4 w-4" /> Status sistem
              </Link>
              <Button
                type="button"
                onClick={() => void refresh(true)}
                disabled={loading || refreshing}
                className="bg-blue-500 text-white hover:bg-blue-400"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                Perbarui monitor
              </Button>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Monitor website tidak menyalakan atau mematikan proses MT5</p>
            <p className="mt-1 text-muted-foreground">
              Pemilih di halaman ini hanya mengubah preview. Untuk order demo, jalankan satu launcher mode yang ditampilkan di bawah.
              Antrean Crypto M1 lama tetap dikunci; BTC H1 lokal adalah strategi terpisah untuk forward-test demo sesuai konfigurasi Python.
              Jangan menjalankan dua robot bersamaan pada login MT5 yang sama.
            </p>
          </div>
        </div>

        <div role="note" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold">Audit historis 7 September 2026 · demo saja</p>
          <p className="mt-1 leading-6 text-muted-foreground">
            EURJPY H1: profit factor holdout 1,04 turun menjadi 0,81 ketika transaksi yang sama diberi penalti biaya tambahan.
            Ketahanan biayanya belum memadai. XAU H1/M15 positif pada holdout, tetapi XAU H1 negatif pada training dengan resimulasi biaya 2×.
            Ini uji ulang data historis, bukan validasi masa depan atau proyeksi profit akun. Audit ini tidak mengubah mode atau lot robot.
          </p>
          <Link href="/trade-intelligence" className="mt-2 inline-block font-medium text-primary underline underline-offset-4">Periksa bukti forward-test akun Anda</Link>
        </div>

        <Card className="overflow-hidden border-blue-500/20">
          <CardContent className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_280px] md:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Pilih strategi yang ingin dipantau</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Mode aktif di preview: <strong className="text-foreground">{strategy.label}</strong>. Untuk menjalankan mode yang sama di MT5,
                  buka <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{strategy.launcher}</code>.
                </p>
              </div>
            </div>
            <Select
              value={strategyMode}
              items={[
                { value: 'stable_h1', label: 'Stable H1 · risk cap 0,25%' },
                { value: 'aggressive_m15', label: 'Aggressive M15 · risk cap 0,15%' },
              ]}
              onValueChange={(value) => {
                if (value !== 'stable_h1' && value !== 'aggressive_m15') return;
                if (value === strategyMode) return;
                requestRef.current?.abort();
                setPreview(null);
                setError(null);
                setLoading(true);
                setStrategyMode(value);
              }}
            >
              <SelectTrigger aria-label="Mode strategi Forex" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stable_h1">Stable H1 · risk cap 0,25%</SelectItem>
                <SelectItem value="aggressive_m15">Aggressive M15 · risk cap 0,15%</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
            Monitor Forex gagal diperbarui: {error}{preview ? ' Data terakhir tetap ditampilkan.' : ''}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Pair siap dianalisis</CardDescription></CardHeader>
            <CardContent className="flex items-end justify-between">
              <p className="text-3xl font-bold">{loading ? '—' : `${summary.ready}/${preview?.rows.length ?? 0}`}</p>
              <Activity className="h-5 w-5 text-blue-500" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Kandidat BUY</CardDescription></CardHeader>
            <CardContent className="flex items-end justify-between">
              <p className="text-3xl font-bold text-emerald-500">{loading ? '—' : summary.buy}</p>
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Kandidat SELL</CardDescription></CardHeader>
            <CardContent className="flex items-end justify-between">
              <p className="text-3xl font-bold text-red-500">{loading ? '—' : summary.sell}</p>
              <TrendingDown className="h-5 w-5 text-red-500" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Runtime eksekusi</CardDescription></CardHeader>
            <CardContent className="flex items-end justify-between">
              <div>
                <p className="font-semibold">Combined demo</p>
                <p className="mt-1 text-xs text-muted-foreground">Proses lokal eksternal</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-amber-500" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" /> Preview {strategy.label}</CardTitle>
                <CardDescription className="mt-1">Sinyal indikatif; quote dan guard broker tetap menjadi sumber keputusan robot.</CardDescription>
              </div>
              <p className="text-xs text-muted-foreground">
                {preview?.scannedAt ? `Diperbarui ${new Date(preview.scannedAt).toLocaleTimeString('id-ID')}` : 'Menunggu data'}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {loading && !preview ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-56 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sortedRows.map((row) => {
                  const signal = signalPresentation(row.signal);
                  return (
                    <article key={row.symbol} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-mono text-lg font-bold">{row.symbol}</h2>
                          <p className="text-xs text-muted-foreground">{row.name}</p>
                        </div>
                        <Badge variant="outline" className={signal.className}>{signal.label}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Harga close</p>
                          <p className="mt-1 font-mono font-semibold">{formatPrice(row.price)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/50 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {strategyMode === 'stable_h1' ? 'Batas breakout' : 'RSI sekarang'}
                          </p>
                          <p className="mt-1 font-mono font-semibold">
                            {strategyMode === 'stable_h1'
                              ? formatPrice(row.trend === 'bearish' ? row.breakoutLow : row.breakoutHigh)
                              : row.rsi?.toFixed(2) ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">EMA 50</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.ema50)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">EMA 200</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.ema200)}</p>
                        </div>
                        {strategyMode === 'aggressive_m15' && (
                          <>
                            <div>
                              <p className="text-xs text-muted-foreground">RSI sebelumnya</p>
                              <p className="font-mono text-xs font-medium">{row.previousRsi?.toFixed(2) ?? '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Jarak EMA / ATR</p>
                              <p className="font-mono text-xs font-medium">{row.emaSeparationAtr?.toFixed(2) ?? '—'}</p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">Stop indikatif</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.stopLoss)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Target indikatif</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.takeProfit)}</p>
                        </div>
                      </div>
                      <p className="mt-4 min-h-10 text-xs leading-5 text-muted-foreground">{row.reason}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {row.lastClosedAt ? new Date(row.lastClosedAt).toLocaleString('id-ID') : 'Belum tersedia'}</span>
                        <Link href={`/asset/${encodeURIComponent(row.symbol)}`} className="flex items-center gap-1 font-medium text-primary hover:underline">
                          Detail <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Aturan strategi Forex</CardTitle>
              <CardDescription>Kondisi entry {strategy.label} yang sama dengan robot Forex lokal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {strategy.rules.map(([number, title, detail]) => (
                <div key={number} className="flex gap-3 rounded-xl border border-border/60 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{number}</div>
                  <div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Menyalakan pada akun demo</CardTitle>
              <CardDescription>{strategy.label}; entry Crypto baru tetap terkunci.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Login terminal MT5 ke akun demo yang benar dan aktifkan Algo Trading.',
                'Pastikan identitas login, server, company, dan currency sesuai konfigurasi robot.',
                `Jalankan ${strategy.launcher} dari folder mt5-robot.`,
                'Pantau combined_demo_robot.log, terminal MT5, serta batas risiko akun.',
              ].map((step) => (
                <div key={step} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{step}</span>
                </div>
              ))}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-5 text-muted-foreground">
                Risk cap mode ini {strategy.riskCap} per transaksi. Halaman tidak menjanjikan profit dan tidak memiliki akses langsung untuk memulai proses Windows atau menekan Algo Trading di terminal MT5.
              </div>
              <Link href="/operations" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
                Periksa kesiapan sistem <ExternalLink className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
