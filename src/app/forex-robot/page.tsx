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
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type ForexPreviewSignal = 'buy' | 'sell' | 'wait' | 'unavailable';
type ForexPreviewTrend = 'bullish' | 'bearish' | 'neutral';

interface ForexPreviewRow {
  symbol: string;
  name: string;
  signal: ForexPreviewSignal;
  trend?: ForexPreviewTrend;
  price?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  atr?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  lastClosedAt?: string;
  reason: string;
}

interface ForexPreview {
  scannedAt: string;
  timeframe: 'M15';
  source: string;
  rows: ForexPreviewRow[];
}

function finiteOptional(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePreview(value: unknown): ForexPreview | null {
  if (typeof value !== 'object' || value === null) return null;
  const root = value as Record<string, unknown>;
  const data = typeof root.data === 'object' && root.data !== null
    ? root.data as Record<string, unknown>
    : null;
  if (!data || typeof data.scannedAt !== 'string' || !Array.isArray(data.rows)) return null;

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
      rsi: finiteOptional(row.rsi),
      atr: finiteOptional(row.atr),
      stopLoss: row.stopLoss === null ? null : finiteOptional(row.stopLoss),
      takeProfit: row.takeProfit === null ? null : finiteOptional(row.takeProfit),
      lastClosedAt: typeof row.lastClosedAt === 'string' ? row.lastClosedAt : undefined,
      reason: row.reason,
    }];
  });

  return {
    scannedAt: data.scannedAt,
    timeframe: 'M15',
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
  const [preview, setPreview] = useState<ForexPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (silent = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch('/api/forex-robot', {
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
      if (!parsed) throw new Error('Respons monitor Forex tidak valid.');
      setPreview(parsed);
      setError(null);
    } catch (caughtError) {
      if (!(caughtError instanceof DOMException && caughtError.name === 'AbortError')) {
        setError(caughtError instanceof Error ? caughtError.message : 'Monitor Forex gagal dimuat.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.35),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.18),transparent_35%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="border-blue-300/20 bg-blue-400/15 text-blue-100">MT5 · M15</Badge>
                <Badge className="border-white/10 bg-white/5 text-slate-200">EMA 50/200 · RSI 14</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Bot className="h-6 w-6 text-blue-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Robot Forex</h1>
                  <p className="mt-1 text-sm text-slate-300">Monitor strategi pullback M15 untuk runtime MT5 gabungan.</p>
                </div>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300">
                Preview ini memakai candle final dari provider website. Robot tetap menghitung ulang dari data broker MT5,
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
              Untuk akun demo yang sama, jalankan satu <code className="font-mono text-xs">run_combined_demo.bat</code>.
              Jangan menjalankan robot forex dan crypto standalone bersamaan pada login MT5 yang sama.
            </p>
          </div>
        </div>

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
                <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" /> Preview strategi M15</CardTitle>
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
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">RSI 14</p>
                          <p className="mt-1 font-mono font-semibold">{row.rsi?.toFixed(1) ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">EMA 50</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.ema50)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">EMA 200</p>
                          <p className="font-mono text-xs font-medium">{formatPrice(row.ema200)}</p>
                        </div>
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
              <CardDescription>Kondisi entry yang sama dengan robot Forex M15 lokal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ['1', 'Candle final M15', 'Candle yang masih berjalan tidak digunakan untuk membuat sinyal.'],
                ['2', 'Filter tren EMA', 'BUY memerlukan EMA 50 > EMA 200; SELL memerlukan EMA 50 < EMA 200.'],
                ['3', 'Filter pullback RSI', 'BUY menunggu RSI < 45; SELL menunggu RSI > 55.'],
                ['4', 'Validasi broker & risiko', 'Spread, quote, posisi, cooldown, daily loss, dan open risk diperiksa di MT5.'],
              ].map(([number, title, detail]) => (
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
              <CardDescription>Satu runtime untuk Forex dan crypto pada login MT5 yang sama.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Login terminal MT5 ke akun demo yang benar dan aktifkan Algo Trading.',
                'Pastikan identitas login, server, company, dan currency sesuai konfigurasi robot.',
                'Jalankan run_combined_demo.bat dari folder mt5-robot.',
                'Pantau forex_robot.log, terminal MT5, serta batas risiko akun.',
              ].map((step) => (
                <div key={step} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{step}</span>
                </div>
              ))}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-5 text-muted-foreground">
                Halaman ini tidak menjanjikan profit dan tidak memiliki akses langsung untuk memulai proses Windows atau menekan Algo Trading di terminal MT5.
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
