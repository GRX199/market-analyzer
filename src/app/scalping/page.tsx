'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ALL_SYMBOLS } from '@/lib/constants';
import { useUserStore } from '@/stores/user-store';
import { toast } from 'sonner';
import { deriveClosedScalperSignal } from '@/lib/scalping/signal';
import { useTradeHistory } from '@/hooks/use-trade-history';

const IS_TRADING_DEPLOYMENT_ENABLED =
  process.env.NEXT_PUBLIC_TRADING_ENABLED === 'true';

const playAlertSound = (type: 'buy' | 'sell') => {
  try {
    const AudioContextConstructor =
      window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) return;

    const ctx = new AudioContextConstructor();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'buy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    }

    osc.addEventListener('ended', () => {
      void ctx.close();
    }, { once: true });
  } catch (error) {
    console.error('Audio failed', error);
  }
};

function rememberBoundedKey(keys: Set<string>, key: string, maxSize = 240) {
  keys.add(key);
  if (keys.size <= maxSize) return;

  const oldestKey = keys.values().next().value;
  if (oldestKey) keys.delete(oldestKey);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

export default function ScalpingDashboard() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isAutoTradingEnabled, setIsAutoTradingEnabled] = useState(false);
  const [isRobotInterrupted, setIsRobotInterrupted] = useState(false);
  const [isArmDialogOpen, setIsArmDialogOpen] = useState(false);
  const [requestedVolume, setRequestedVolume] = useState('0.01');
  const armedAfterCandleRef = useRef<number | null>(null);
  const announcedSignalKeysRef = useRef(new Set<string>());
  const queuedCandleKeysRef = useRef(new Set<string>());
  const queueRequestInFlightRef = useRef(false);

  const {
    currentPrice,
    recentTrades,
    currentKline,
    klineHistory,
    isConnected,
    isBackfillComplete,
    reconnectAttempt,
    reconnectExhausted,
    connectionError,
    feedSymbol,
    reconnect,
  } = useBinanceWebSocket(symbol);
  const createAutoTrade = useUserStore((state) => state.createAutoTrade);
  const authenticatedUserId = useUserStore((state) => state.authenticatedUserId);
  const {
    trades: queuedTrades,
    loading: queueHistoryLoading,
    error: queueHistoryError,
    refresh: refreshQueueHistory,
  } = useTradeHistory(Boolean(authenticatedUserId));

  // 1. Order Flow
  const { buyVolume, totalVolume } = useMemo(() => {
    let buy = 0, sell = 0;
    recentTrades.forEach(t => { if (t.isBuyerMaker) sell += t.qty; else buy += t.qty; });
    return { buyVolume: buy, totalVolume: buy + sell };
  }, [recentTrades]);
  const buyPressurePct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // Strategy decisions use finalized candles only. The resulting signal is
  // eligible for execution when the next forming candle appears.
  const closedSignal = useMemo(
    () => deriveClosedScalperSignal(klineHistory),
    [klineHistory],
  );
  const isCurrentFeed = feedSymbol === symbol;
  const activeSignal = isCurrentFeed && isBackfillComplete ? closedSignal.action : null;
  const emaSignal = isCurrentFeed && isBackfillComplete ? closedSignal.emaSignal : 'wait';
  const momentum = isCurrentFeed && isBackfillComplete ? closedSignal.momentum : 'wait';

  useEffect(() => {
    if (!IS_TRADING_DEPLOYMENT_ENABLED || !isAutoTradingEnabled) return;

    if (!isConnected || !isBackfillComplete || !authenticatedUserId) {
      if (!isRobotInterrupted) {
        queueMicrotask(() => setIsRobotInterrupted(true));
        toast.warning('Robot dijeda', {
          description: isConnected
            ? isBackfillComplete
              ? 'Sesi autentikasi tidak tersedia. Aktifkan ulang robot setelah login.'
              : 'Riwayat candle belum tepercaya. Aktifkan ulang robot setelah sinkronisasi berhasil.'
            : 'Koneksi market terputus. Aktifkan ulang robot setelah koneksi pulih.',
        });
      }
    }
  }, [
    authenticatedUserId,
    isAutoTradingEnabled,
    isBackfillComplete,
    isConnected,
    isRobotInterrupted,
  ]);

  useEffect(() => {
    if (
      !activeSignal
      || closedSignal.sourceCandleStart === null
      || !isCurrentFeed
    ) {
      return;
    }

    const signalKey =
      `${symbol}:${closedSignal.sourceCandleStart}:${activeSignal}`;
    if (!announcedSignalKeysRef.current.has(signalKey)) {
      rememberBoundedKey(announcedSignalKeysRef.current, signalKey);
      if (isAudioEnabled) playAlertSound(activeSignal);
    }

    if (
      !IS_TRADING_DEPLOYMENT_ENABLED
      || !isAutoTradingEnabled
      || !isConnected
      || !isBackfillComplete
      || !authenticatedUserId
      || !currentKline
      || currentKline.isFinal
    ) {
      return;
    }

    if (isRobotInterrupted) return;
    if (currentKline.startTime <= closedSignal.sourceCandleStart) return;

    if (armedAfterCandleRef.current === null) {
      armedAfterCandleRef.current = currentKline.startTime;
      return;
    }

    // Arming tidak pernah mengeksekusi sinyal yang sudah aktif pada candle saat ini.
    if (currentKline.startTime <= armedAfterCandleRef.current) return;

    // Maksimum satu intent per symbol/candle, meskipun sinyal berfluktuasi.
    const candleKey = `${symbol}:${currentKline.startTime}`;
    if (queuedCandleKeysRef.current.has(candleKey)) return;
    if (queueRequestInFlightRef.current) return;
    rememberBoundedKey(queuedCandleKeysRef.current, candleKey);
    queueRequestInFlightRef.current = true;

    const executionCandleStart = currentKline.startTime;
    const queuedAction = activeSignal;
    const queueSymbol = symbol.replace('/', '').toUpperCase();
    const idempotencyKey =
      `scalper:${authenticatedUserId}:${queueSymbol}:${executionCandleStart}`;
    const volume = Number(requestedVolume);

    void createAutoTrade({
      symbol: queueSymbol,
      marketType: 'crypto',
      action: queuedAction,
      volume,
      idempotencyKey,
    }).then((receipt) => {
      if (receipt.duplicate) {
        toast.info('Sinyal sudah pernah diantrekan', {
          description: `${symbol} candle ${new Date(executionCandleStart).toLocaleTimeString()}`,
        });
        return;
      }

      toast.success(`${queuedAction.toUpperCase()} masuk antrean robot`, {
        description: `${symbol} • volume ${volume} • status ${receipt.status}`,
      });
    }).catch((error: unknown) => {
      setIsRobotInterrupted(true);
      setIsAutoTradingEnabled(false);
      toast.error('Robot dihentikan — verifikasi antrean', {
        description: getErrorMessage(error),
      });
    }).finally(() => {
      queueRequestInFlightRef.current = false;
      void refreshQueueHistory();
    });
  }, [
    activeSignal,
    authenticatedUserId,
    closedSignal.sourceCandleStart,
    createAutoTrade,
    currentKline,
    isAudioEnabled,
    isAutoTradingEnabled,
    isBackfillComplete,
    isConnected,
    isCurrentFeed,
    isRobotInterrupted,
    refreshQueueHistory,
    requestedVolume,
    symbol,
  ]);

  const candleDisplay = useMemo(() => {
    const all = [...klineHistory.slice(-9)];
    if (currentKline) {
      const existingIndex = all.findIndex(kline => kline.startTime === currentKline.startTime);
      if (existingIndex >= 0) all[existingIndex] = currentKline;
      else all.push(currentKline);
    }
    return all;
  }, [klineHistory, currentKline]);

  const parsedVolume = Number(requestedVolume);
  const isVolumeValid = Number.isFinite(parsedVolume) && parsedVolume > 0 && parsedVolume <= 100;
  const isRobotPaused =
    isAutoTradingEnabled
    && (!isConnected || !isBackfillComplete || !authenticatedUserId || isRobotInterrupted);

  const handleSymbolChange = (nextSymbol: string | null) => {
    if (!nextSymbol || nextSymbol === symbol) return;

    if (isAutoTradingEnabled) {
      setIsAutoTradingEnabled(false);
      toast.info('Robot dimatikan', {
        description: 'Perubahan simbol memerlukan konfirmasi dan arming ulang.',
      });
    }

    setIsRobotInterrupted(false);
    armedAfterCandleRef.current = null;
    setSymbol(nextSymbol);
  };

  const handleRobotButtonClick = () => {
    if (!IS_TRADING_DEPLOYMENT_ENABLED) {
      toast.warning('Trading dinonaktifkan oleh deployment', {
        description: 'Aktifkan NEXT_PUBLIC_TRADING_ENABLED hanya setelah semua pemeriksaan paper trading lulus.',
      });
      return;
    }

    if (isAutoTradingEnabled) {
      setIsAutoTradingEnabled(false);
      armedAfterCandleRef.current = null;
      setIsRobotInterrupted(false);
      toast.info('Robot dimatikan');
      return;
    }

    if (!authenticatedUserId) {
      toast.error('Login diperlukan', {
        description: 'Robot hanya dapat mengantrekan order untuk akun yang terautentikasi.',
      });
      return;
    }

    if (!isConnected || !isBackfillComplete || !currentKline || !isCurrentFeed) {
      toast.error('Data market belum siap', {
        description: 'Tunggu feed simbol aktif, backfill candle final, dan candle live sebelum mengaktifkan robot.',
      });
      return;
    }

    setIsArmDialogOpen(true);
  };

  const handleConfirmArming = () => {
    if (
      !IS_TRADING_DEPLOYMENT_ENABLED
      || !isVolumeValid
      || !currentKline
      || !isConnected
      || !isBackfillComplete
      || !authenticatedUserId
      || !isCurrentFeed
    ) {
      return;
    }

    armedAfterCandleRef.current = currentKline.startTime;
    setIsRobotInterrupted(false);
    setIsAutoTradingEnabled(true);
    setIsArmDialogOpen(false);
    toast.warning('Robot menunggu sinyal candle tertutup', {
      description: 'Sinyal candle final hanya boleh dieksekusi pada candle berikutnya.',
    });
  };

  return (
    <DashboardLayout>
      <div className={cn(
        'fixed inset-0 pointer-events-none transition-colors duration-500 z-0',
        activeSignal === 'buy'
          ? 'bg-green-500/10'
          : activeSignal === 'sell'
            ? 'bg-red-500/10'
            : 'bg-transparent',
      )} />

      <div className="relative z-10 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
              <h1 className="text-2xl font-black uppercase tracking-tighter">Scalper Monitor</h1>
              <Badge variant="outline">1m guarded</Badge>
            </div>
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected
                ? isBackfillComplete ? 'MARKET LIVE' : 'SYNCING'
                : reconnectExhausted ? 'OFFLINE' : `RECONNECT ${reconnectAttempt}`}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Select value={symbol} onValueChange={handleSymbolChange}>
              <SelectTrigger className="w-[140px] font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_SYMBOLS.filter(s => s.marketType === 'crypto').map(s => (
                  <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={isAudioEnabled ? 'default' : 'outline'}
              className={isAudioEnabled ? 'bg-blue-600' : ''}
              onClick={() => setIsAudioEnabled(enabled => !enabled)}
              aria-label={isAudioEnabled ? 'Matikan audio sinyal' : 'Aktifkan audio sinyal'}
              title={isAudioEnabled ? 'Matikan audio sinyal' : 'Aktifkan audio sinyal'}
            >
              {isAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            <Button
              variant={isAutoTradingEnabled ? "default" : "outline"}
              className={cn(
                isAutoTradingEnabled
                  ? isRobotPaused
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                  : 'border-emerald-500/50 text-emerald-500',
              )}
              onClick={handleRobotButtonClick}
              disabled={!IS_TRADING_DEPLOYMENT_ENABLED}
            >
              <Bot className="h-4 w-4 mr-2" />
              {!IS_TRADING_DEPLOYMENT_ENABLED
                ? 'TRADING DISABLED'
                : isRobotPaused
                  ? 'ROBOT PAUSED'
                  : isAutoTradingEnabled
                    ? 'ROBOT ON'
                    : 'Aktifkan Robot'}
            </Button>
          </div>
        </div>

        {connectionError && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <span>{connectionError}</span>
            {!isConnected && (
              <Button type="button" size="sm" variant="outline" onClick={reconnect}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
            )}
          </div>
        )}

        {!IS_TRADING_DEPLOYMENT_ENABLED && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm"
          >
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div>
              <p className="font-semibold">Mode analisis saja — pengiriman order dinonaktifkan</p>
              <p className="text-muted-foreground">
                Sinyal, chart, dan audio tetap berjalan, tetapi deployment ini tidak dapat
                mengirim intent ke antrean robot.
              </p>
            </div>
          </div>
        )}

        {isAutoTradingEnabled && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-sm',
              isRobotPaused
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-emerald-500/30 bg-emerald-500/10',
            )}
          >
            {isRobotPaused
              ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
            <div>
              <p className="font-semibold">
                {isRobotPaused ? 'Robot dijeda — matikan lalu aktifkan ulang' : 'Robot ter-arming'}
              </p>
              <p className="text-muted-foreground">
                {isRobotPaused
                  ? 'Tidak ada order baru yang akan diantrekan selama status ini.'
                  : `Menunggu sinyal dari candle tertutup ${symbol}; eksekusi hanya pada candle 1 menit berikutnya dengan volume maksimum ${parsedVolume}.`}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Live Price</div>
              <div className="text-3xl font-black">{currentPrice > 0 ? currentPrice.toFixed(2) : "---"}</div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", emaSignal === 'bullish' ? "border-green-500/50" : emaSignal === 'bearish' ? "border-red-500/50" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Tren Utama (EMA 5/13)</div>
              <div className={cn("text-xl font-black", emaSignal === 'bullish' ? "text-green-500" : emaSignal === 'bearish' ? "text-red-500" : "text-muted-foreground")}>
                {emaSignal.toUpperCase()}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", momentum === 'buy' ? "border-green-500/50" : momentum === 'sell' ? "border-red-500/50" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Momentum Final</div>
              <div className={cn("text-xl font-black", momentum === 'buy' ? "text-green-500" : momentum === 'sell' ? "text-red-500" : "text-muted-foreground")}>
                {momentum === 'wait' ? 'WAIT' : `${momentum.toUpperCase()} (2 CLOSED)`}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", activeSignal ? "border-emerald-500 bg-emerald-500/10 animate-pulse" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Sinyal Candle Tertutup</div>
              <div className="text-xl font-black text-foreground">
                {activeSignal ? `🔥 ${activeSignal.toUpperCase()} MATCH` : 'STANDBY'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Candle Tracker</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-[120px] justify-center">
                {candleDisplay.map((k, i) => {
                  const candleTone = k.close > k.open
                    ? 'bg-green-500'
                    : k.close < k.open ? 'bg-red-500' : 'bg-slate-500';
                  const range = k.high - k.low;
                  const bodyTop = Math.max(k.open, k.close);
                  const bodyBot = Math.min(k.open, k.close);
                  const bodyH = range > 0 ? Math.max(4, ((bodyTop - bodyBot) / range) * 100) : 4;
                  return (
                    <div key={k.startTime} className={cn("flex flex-col items-center", i === candleDisplay.length - 1 ? "opacity-100" : "opacity-70")} style={{ width: '28px' }}>
                      <div className={cn("w-full rounded-sm", candleTone)} style={{ height: `${bodyH}%`, minHeight: '8px' }} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Order Flow (Last 200)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-between mb-2">
                <span className="text-xl font-black text-green-500">{buyPressurePct.toFixed(1)}%</span>
                <span className="text-xl font-black text-red-500">{(100 - buyPressurePct).toFixed(1)}%</span>
              </div>
              <div className="h-4 w-full bg-red-500/20 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${buyPressurePct}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" />
                  Rekonsiliasi antrean terbaru
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status pending atau processing belum final. Jangan membuat intent pengganti
                  sebelum status dan broker ticket diperiksa.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void refreshQueueHistory()}
                disabled={queueHistoryLoading || !authenticatedUserId}
              >
                <RefreshCw className={cn(
                  'mr-2 h-4 w-4',
                  queueHistoryLoading && 'animate-spin',
                )} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queueHistoryError && (
              <div className="mb-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
                Riwayat antrean gagal dimuat: {queueHistoryError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Waktu</th>
                    <th className="px-2 py-2 font-medium">Symbol</th>
                    <th className="px-2 py-2 font-medium">Intent</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Attempts</th>
                    <th className="px-2 py-2 font-medium">Broker ticket / error</th>
                  </tr>
                </thead>
                <tbody>
                  {queuedTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/40">
                      <td className="whitespace-nowrap px-2 py-2 text-xs">
                        {new Date(trade.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="px-2 py-2 font-mono">{trade.symbol}</td>
                      <td className="px-2 py-2">
                        <span className={trade.action === 'buy' ? 'text-green-500' : 'text-red-500'}>
                          {trade.action.toUpperCase()}
                        </span>
                          <span className="ml-2 text-muted-foreground">· {trade.volume}</span>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={tradeStatusClass(trade.status, trade.errorMessage)}>
                          {tradeStatusLabel(trade.status, trade.errorMessage)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 font-mono">{trade.attempts}</td>
                      <td className="max-w-[280px] truncate px-2 py-2 font-mono text-xs">
                        {trade.brokerOrderTicket
                          ?? trade.errorMessage
                          ?? (trade.executionPrice === null
                            ? '—'
                            : `price ${trade.executionPrice}`)}
                      </td>
                    </tr>
                  ))}
                  {!queueHistoryLoading && queuedTrades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                        Belum ada intent trading untuk akun ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isArmDialogOpen} onOpenChange={setIsArmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Konfirmasi robot trading
            </DialogTitle>
            <DialogDescription>
              Fitur ini mengirim intent ke antrean robot dan dapat menghasilkan order riil.
              Sinyal tidak menjamin profit dan kerugian tetap mungkin terjadi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">{symbol} • timeframe 1 menit</p>
              <p className="mt-1 text-muted-foreground">
                Robot mulai dari candle berikutnya, berhenti mengantre saat koneksi putus,
                dan tidak mengirim lebih dari satu intent per candle.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="robot-volume" className="text-sm font-medium">
                Volume maksimum yang diminta
              </label>
              <Input
                id="robot-volume"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={requestedVolume}
                onChange={(event) => setRequestedVolume(event.target.value)}
                aria-invalid={!isVolumeValid}
              />
              <p className={cn(
                'text-xs',
                isVolumeValid ? 'text-muted-foreground' : 'text-destructive',
              )}>
                {isVolumeValid
                  ? 'Risk control backend dapat menolak atau menurunkan volume ini.'
                  : 'Volume harus lebih dari 0 dan maksimal 100.'}
              </p>
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button
              onClick={handleConfirmArming}
              disabled={
                !IS_TRADING_DEPLOYMENT_ENABLED
                || !isVolumeValid
                || !currentKline
                || !isConnected
                || !isBackfillComplete
                || !authenticatedUserId
                || !isCurrentFeed
              }
              className="bg-amber-600 hover:bg-amber-700"
            >
              Saya paham, aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function isMtfGuardRejection(status: string, errorMessage: string | null): boolean {
  return status === 'failed'
    && errorMessage?.startsWith('strict M5/M15 alignment rejected') === true;
}

function tradeStatusClass(status: string, errorMessage: string | null): string {
  if (status === 'executed') {
    return 'border-green-500/30 bg-green-500/10 text-green-500';
  }
  if (isMtfGuardRejection(status, errorMessage)) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
  }
  if (status === 'failed' || status === 'quarantined') {
    return 'border-red-500/30 bg-red-500/10 text-red-500';
  }
  if (status === 'processing') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
  }
  return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
}

function tradeStatusLabel(status: string, errorMessage: string | null): string {
  return isMtfGuardRejection(status, errorMessage)
    ? 'DITOLAK MTF'
    : status.toUpperCase();
}
