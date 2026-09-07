'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Database,
  ExternalLink,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTradeHistory } from '@/hooks/use-trade-history';
import { useUserStore } from '@/stores/user-store';
import { cn } from '@/lib/utils';

interface OperationsStatus {
  checkedAt: string;
  environment: string;
  authentication: {
    verified: boolean;
    ownerConfigured: boolean;
    ownerAuthorized: boolean;
  };
  trading: {
    serverEnabled: boolean;
    browserEnabled: boolean;
    switchesAligned: boolean;
    workerTokenConfigured: boolean;
    adminCredentialConfigured: boolean;
    canQueueOrders: boolean;
  };
  integrations: {
    cronSecretConfigured: boolean;
    telegramConfigured: boolean;
    aiSummaryConfigured: boolean;
    stockRealtimeConfigured: boolean;
  };
  robot: {
    processVisibility: 'external';
    recommendedRuntime: 'combined-demo';
  };
}

function isOperationsStatus(value: unknown): value is OperationsStatus {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.checkedAt === 'string'
    && typeof row.environment === 'string'
    && typeof row.authentication === 'object'
    && row.authentication !== null
    && typeof row.trading === 'object'
    && row.trading !== null
    && typeof row.integrations === 'object'
    && row.integrations !== null
    && typeof row.robot === 'object'
    && row.robot !== null
  );
}

function StatusRow({
  label,
  detail,
  ok,
  optional = false,
}: {
  label: string;
  detail: string;
  ok: boolean;
  optional?: boolean;
}) {
  const Icon = ok ? CheckCircle2 : optional ? CircleDashed : XCircle;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          ok ? 'text-emerald-500' : optional ? 'text-muted-foreground' : 'text-red-500',
        )}
        aria-label={ok ? 'Siap' : optional ? 'Opsional' : 'Belum siap'}
      />
    </div>
  );
}

function isMtfGuardRejection(status: string, errorMessage: string | null): boolean {
  return status === 'failed'
    && errorMessage?.startsWith('strict M5/M15 alignment rejected') === true;
}

function tradeStatusClass(status: string, errorMessage: string | null): string {
  if (status === 'executed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
  if (isMtfGuardRejection(status, errorMessage)) return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
  if (status === 'failed' || status === 'quarantined') return 'border-red-500/30 bg-red-500/10 text-red-500';
  if (status === 'processing') return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
  return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
}

function tradeStatusLabel(status: string, errorMessage: string | null): string {
  return isMtfGuardRejection(status, errorMessage)
    ? 'DITOLAK MTF'
    : status.toUpperCase();
}

export default function OperationsPage() {
  const authenticatedUserId = useUserStore((state) => state.authenticatedUserId);
  const [status, setStatus] = useState<OperationsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const {
    trades,
    loading: tradesLoading,
    error: tradesError,
    refresh: refreshTrades,
  } = useTradeHistory(Boolean(authenticatedUserId));

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/operations/status', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload: unknown = await response.json().catch(() => null);
      const row = typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        throw new Error(typeof row.error === 'string' ? row.error : `HTTP ${response.status}`);
      }
      if (!isOperationsStatus(payload)) {
        throw new Error('Respons status sistem tidak valid.');
      }
      setStatus(payload);
      setStatusError(null);
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : 'Status sistem gagal dimuat.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = globalThis.setTimeout(() => void refreshStatus(), 0);
    const interval = globalThis.setInterval(() => void refreshStatus(), 30_000);
    return () => {
      globalThis.clearTimeout(initialTimer);
      globalThis.clearInterval(interval);
    };
  }, [refreshStatus]);

  const queueSummary = useMemo(() => ({
    pending: trades.filter((trade) => trade.status === 'pending').length,
    processing: trades.filter((trade) => trade.status === 'processing').length,
    failed: trades.filter((trade) => trade.status === 'failed').length,
  }), [trades]);

  const refreshAll = async () => {
    await Promise.all([refreshStatus(), refreshTrades()]);
  };

  const tradingReady = status?.trading.canQueueOrders === true;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
              <ServerCog className="h-7 w-7 text-primary" aria-hidden="true" />
              Robot & Sistem
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Satu tempat untuk memeriksa kesiapan autentikasi, kill switch, antrean order,
              dan runtime demo gabungan sebelum robot dijalankan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshAll()}
            disabled={statusLoading || tradesLoading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', (statusLoading || tradesLoading) && 'animate-spin')} />
            Perbarui status
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold">Gunakan akun demo—status “siap” bukan jaminan profit</p>
            <p className="mt-1 text-muted-foreground">
              Halaman ini memeriksa konfigurasi website. Proses robot dan status tombol Algo Trading
              di terminal MT5 berada di luar browser dan tetap harus diperiksa pada mesin robot.
            </p>
          </div>
        </div>

        {statusError && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            Status sistem gagal dimuat: {statusError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className={cn('border-2', tradingReady ? 'border-emerald-500/30' : 'border-blue-500/30')}>
            <CardHeader className="pb-3">
              <CardDescription>Antrean M1 website</CardDescription>
              <CardTitle className="flex items-center gap-2">
                {tradingReady ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> : <ShieldCheck className="h-5 w-5 text-blue-500" />}
                {tradingReady ? 'Antrean M1 diizinkan' : 'Antrean M1 nonaktif'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {tradingReady
                ? 'Website diizinkan membuat intent M1 setelah konfirmasi. Ini bukan status proses MT5.'
                : 'Analisis tetap tersedia. Robot BTC H1 lokal tidak memakai antrean ini dan statusnya harus diperiksa di log.'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>10 intent terbaru</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                {queueSummary.pending} pending · {queueSummary.processing} diproses
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {queueSummary.failed > 0
                ? `${queueSummary.failed} intent gagal terlihat pada riwayat terbaru.`
                : 'Tidak ada kegagalan pada riwayat yang sedang ditampilkan.'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Proses robot lokal</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-amber-500" />
                Tidak terpantau browser
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Gunakan satu proses <code className="font-mono text-xs">run_combined_demo.bat</code> untuk satu login MT5.
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kesiapan inti</CardTitle>
              <CardDescription>Semua pemeriksaan wajib harus hijau sebelum pengiriman intent diaktifkan.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusRow label="Sesi Supabase" detail="Identitas browser diverifikasi server." ok={status?.authentication.verified === true} />
              <StatusRow label="Owner akun MT5" detail="UUID login cocok dengan satu owner yang dikonfigurasi." ok={status?.authentication.ownerAuthorized === true} />
              <StatusRow label="Izin antrean server" detail="TRADING_ENABLED hanya mengizinkan antrean website, bukan kill switch order lokal MT5." ok={status?.trading.serverEnabled === true} />
              <StatusRow label="Kill switch antarmuka" detail="NEXT_PUBLIC_TRADING_ENABLED selaras dengan server." ok={status?.trading.browserEnabled === true && status?.trading.switchesAligned === true} />
              <StatusRow label="Token worker" detail="Bearer token khusus robot terpasang dan bukan placeholder." ok={status?.trading.workerTokenConfigured === true} />
              <StatusRow label="Akses antrean server" detail="Service-role hanya tersedia pada backend website." ok={status?.trading.adminCredentialConfigured === true} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Integrasi opsional</CardTitle>
              <CardDescription>Ketiadaan integrasi ini tidak boleh membuka atau memblokir order MT5.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusRow label="Scheduler alert" detail="CRON_SECRET siap untuk pemeriksaan alert background." ok={status?.integrations.cronSecretConfigured === true} optional />
              <StatusRow label="Telegram" detail="Bot, owner, dan allow-list chat terkonfigurasi." ok={status?.integrations.telegramConfigured === true} optional />
              <StatusRow label="Ringkasan AI" detail="Gemini hanya merangkum analisis dan tidak mengeksekusi order." ok={status?.integrations.aiSummaryConfigured === true} optional />
              <StatusRow label="Realtime saham" detail="Finnhub bersifat opsional; data lain tetap memakai provider server." ok={status?.integrations.stockRealtimeConfigured === true} optional />
              <StatusRow label="Konsistensi kill switch" detail="Nilai public dan server harus sama agar UI tidak menyesatkan." ok={status?.trading.switchesAligned === true} />
              <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                <span>Environment: {status?.environment || '—'}</span>
                <span>{status?.checkedAt ? new Date(status.checkedAt).toLocaleTimeString('id-ID') : 'Belum diperiksa'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Urutan menyalakan mode demo</CardTitle>
            <CardDescription>Forex dan crypto berjalan bergantian dalam satu runtime agar koneksi MT5 tidak dipakai bersamaan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[
              ['1', 'Siapkan terminal MT5', 'Login ke akun demo yang benar, pastikan market terbuka, lalu aktifkan Algo Trading.'],
              ['2', 'Jalankan website', 'Dari folder market-analyzer jalankan npm run dev, lalu login dan buka halaman ini.'],
              ['3', 'Pisahkan antrean dan eksekusi lokal', 'Biarkan antrean M1 lama nonaktif. BTC broker_h1 dan Forex memakai konfigurasi Python; flag website bukan tombol ON/OFF robot lokal.'],
              ['4', 'Jalankan satu robot gabungan', 'Dari folder mt5-robot jalankan run_combined_demo.bat. Jangan jalankan robot crypto/forex terpisah pada login yang sama.'],
            ].map(([number, title, detail]) => (
              <div key={number} className="flex gap-3 rounded-xl border bg-muted/20 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{number}</div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5" /> Riwayat antrean terbaru
                </CardTitle>
                <CardDescription className="mt-1">Audit intent website; ini bukan daftar seluruh posisi di broker.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/forex-robot" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Monitor Forex
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
                <Link href="/scalping" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Monitor crypto
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tradesError && (
              <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                Riwayat antrean gagal dimuat: {tradesError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Waktu</th>
                    <th className="px-2 py-2 font-medium">Simbol</th>
                    <th className="px-2 py-2 font-medium">Aksi</th>
                    <th className="px-2 py-2 font-medium">Diminta</th>
                    <th className="px-2 py-2 font-medium">Aktual MT5</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Percobaan</th>
                    <th className="px-2 py-2 font-medium">Broker / error</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/40">
                      <td className="whitespace-nowrap px-2 py-2 text-xs">{new Date(trade.createdAt).toLocaleString('id-ID')}</td>
                      <td className="px-2 py-2 font-mono">{trade.symbol}</td>
                      <td className="px-2 py-2"><span className={trade.action === 'buy' ? 'text-emerald-500' : 'text-red-500'}>{trade.action.toUpperCase()}</span></td>
                      <td className="px-2 py-2 font-mono">{trade.volume}</td>
                      <td className="px-2 py-2 font-mono">{trade.executedVolume ?? '—'}</td>
                      <td className="px-2 py-2"><Badge variant="outline" className={tradeStatusClass(trade.status, trade.errorMessage)}>{tradeStatusLabel(trade.status, trade.errorMessage)}</Badge></td>
                      <td className="px-2 py-2 font-mono">{trade.attempts}</td>
                      <td className="max-w-[280px] truncate px-2 py-2 font-mono text-xs">{trade.brokerOrderTicket ?? trade.errorMessage ?? (trade.executionPrice === null ? '—' : `price ${trade.executionPrice}`)}</td>
                    </tr>
                  ))}
                  {!tradesLoading && trades.length === 0 && (
                    <tr><td colSpan={8} className="px-2 py-8 text-center text-muted-foreground"><Activity className="mx-auto mb-2 h-6 w-6 opacity-40" />Belum ada intent trading untuk akun ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
