'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { usePathname } from 'next/navigation';

import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { deriveClosedScalperSignal } from '@/lib/scalping/signal';
import { useUserStore } from '@/stores/user-store';

const IS_TRADING_DEPLOYMENT_ENABLED =
  process.env.NEXT_PUBLIC_TRADING_ENABLED === 'true';

type ScalperFeed = ReturnType<typeof useBinanceWebSocket>;

interface ScalperRobotContextValue extends ScalperFeed {
  symbol: string;
  requestedVolume: string;
  isAutoTradingEnabled: boolean;
  isRobotInterrupted: boolean;
  isRobotPaused: boolean;
  setRequestedVolume: (volume: string) => void;
  changeSymbol: (symbol: string) => void;
  armRobot: (armedAfterCandleStart: number) => boolean;
  stopRobot: () => void;
}

const ScalperRobotContext = createContext<ScalperRobotContextValue | null>(null);
const ScalperRobotStatusContext = createContext({
  symbol: 'BTC/USDT',
  isAutoTradingEnabled: false,
  isRobotPaused: false,
});

function rememberBoundedKey(keys: Set<string>, key: string, maxSize = 240) {
  keys.add(key);
  if (keys.size <= maxSize) return;

  const oldestKey = keys.values().next().value;
  if (oldestKey) keys.delete(oldestKey);
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Terjadi kesalahan antrean yang tidak diketahui.';
}

export function ScalperRobotProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [requestedVolume, setRequestedVolume] = useState('0.01');
  const [isAutoTradingEnabled, setIsAutoTradingEnabled] = useState(false);
  const [isRobotInterrupted, setIsRobotInterrupted] = useState(false);
  const armedAfterCandleRef = useRef<number | null>(null);
  const queuedCandleKeysRef = useRef(new Set<string>());
  const queueRequestInFlightRef = useRef(false);

  const pathname = usePathname();
  const shouldKeepFeedAlive = isAutoTradingEnabled || pathname === '/scalping';
  const feed = useBinanceWebSocket(symbol, shouldKeepFeedAlive);
  const createAutoTrade = useUserStore((state) => state.createAutoTrade);
  const authenticatedUserId = useUserStore((state) => state.authenticatedUserId);
  const closedSignal = useMemo(
    () => deriveClosedScalperSignal(feed.klineHistory),
    [feed.klineHistory],
  );
  const isCurrentFeed = feed.feedSymbol === symbol;
  const activeSignal = isCurrentFeed && feed.isBackfillComplete
    ? closedSignal.action
    : null;
  const isRobotPaused = isAutoTradingEnabled && (
    !feed.isConnected
    || !feed.isBackfillComplete
    || !authenticatedUserId
    || isRobotInterrupted
  );

  useEffect(() => {
    if (!IS_TRADING_DEPLOYMENT_ENABLED || !isAutoTradingEnabled) return;
    if (
      feed.isConnected
      && feed.isBackfillComplete
      && authenticatedUserId
    ) {
      return;
    }
    if (isRobotInterrupted) return;

    queueMicrotask(() => setIsRobotInterrupted(true));
    toast.warning('Robot dijeda', {
      description: feed.isConnected
        ? feed.isBackfillComplete
          ? 'Sesi autentikasi tidak tersedia. Aktifkan ulang robot setelah login.'
          : 'Riwayat candle belum tepercaya. Aktifkan ulang robot setelah sinkronisasi berhasil.'
        : 'Koneksi market terputus. Aktifkan ulang robot setelah koneksi pulih.',
    });
  }, [
    authenticatedUserId,
    feed.isBackfillComplete,
    feed.isConnected,
    isAutoTradingEnabled,
    isRobotInterrupted,
  ]);

  useEffect(() => {
    if (
      !activeSignal
      || closedSignal.sourceCandleStart === null
      || !IS_TRADING_DEPLOYMENT_ENABLED
      || !isAutoTradingEnabled
      || !feed.isConnected
      || !feed.isBackfillComplete
      || !authenticatedUserId
      || !feed.currentKline
      || feed.currentKline.isFinal
      || !isCurrentFeed
      || isRobotInterrupted
    ) {
      return;
    }
    if (feed.currentKline.startTime <= closedSignal.sourceCandleStart) return;

    if (armedAfterCandleRef.current === null) {
      armedAfterCandleRef.current = feed.currentKline.startTime;
      return;
    }
    if (feed.currentKline.startTime <= armedAfterCandleRef.current) return;

    const candleKey = `${symbol}:${feed.currentKline.startTime}`;
    if (queuedCandleKeysRef.current.has(candleKey)) return;
    if (queueRequestInFlightRef.current) return;

    const volume = Number(requestedVolume);
    if (!Number.isFinite(volume) || volume <= 0 || volume > 100) {
      queueMicrotask(() => {
        setIsRobotInterrupted(true);
        setIsAutoTradingEnabled(false);
      });
      toast.error('Robot dihentikan — volume tidak valid');
      return;
    }

    rememberBoundedKey(queuedCandleKeysRef.current, candleKey);
    queueRequestInFlightRef.current = true;
    const executionCandleStart = feed.currentKline.startTime;
    const queuedAction = activeSignal;
    const queueSymbol = symbol.replace('/', '').toUpperCase();
    const idempotencyKey =
      `scalper:${authenticatedUserId}:${queueSymbol}:${executionCandleStart}`;

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
        description: `${symbol} • volume tepat ${volume} • status ${receipt.status}`,
      });
    }).catch((error: unknown) => {
      setIsRobotInterrupted(true);
      setIsAutoTradingEnabled(false);
      toast.error('Robot dihentikan — verifikasi antrean', {
        description: errorMessage(error),
      });
    }).finally(() => {
      queueRequestInFlightRef.current = false;
      window.dispatchEvent(new Event('auto-trade-history-refresh'));
    });
  }, [
    activeSignal,
    authenticatedUserId,
    closedSignal.sourceCandleStart,
    createAutoTrade,
    feed.currentKline,
    feed.isBackfillComplete,
    feed.isConnected,
    isAutoTradingEnabled,
    isCurrentFeed,
    isRobotInterrupted,
    requestedVolume,
    symbol,
  ]);

  const changeSymbol = useCallback((nextSymbol: string) => {
    if (!nextSymbol || nextSymbol === symbol) return;
    if (isAutoTradingEnabled) {
      setIsAutoTradingEnabled(false);
      toast.info('Robot dimatikan', {
        description: 'Perubahan simbol memerlukan konfirmasi dan arming ulang.',
      });
    }
    armedAfterCandleRef.current = null;
    queueRequestInFlightRef.current = false;
    setIsRobotInterrupted(false);
    setSymbol(nextSymbol);
  }, [isAutoTradingEnabled, symbol]);

  const stopRobot = useCallback(() => {
    setIsAutoTradingEnabled(false);
    setIsRobotInterrupted(false);
    armedAfterCandleRef.current = null;
    toast.info('Robot dimatikan');
  }, []);

  const armRobot = useCallback((armedAfterCandleStart: number) => {
    const volume = Number(requestedVolume);
    if (
      !IS_TRADING_DEPLOYMENT_ENABLED
      || !Number.isFinite(volume)
      || volume <= 0
      || volume > 100
      || !Number.isFinite(armedAfterCandleStart)
      || !feed.isConnected
      || !feed.isBackfillComplete
      || !authenticatedUserId
      || feed.feedSymbol !== symbol
    ) {
      return false;
    }

    armedAfterCandleRef.current = armedAfterCandleStart;
    setIsRobotInterrupted(false);
    setIsAutoTradingEnabled(true);
    toast.warning('Robot menunggu sinyal candle tertutup', {
      description: 'Robot tetap aktif saat Anda berpindah halaman selama tab website terbuka.',
    });
    return true;
  }, [
    authenticatedUserId,
    feed.feedSymbol,
    feed.isBackfillComplete,
    feed.isConnected,
    requestedVolume,
    symbol,
  ]);

  const value: ScalperRobotContextValue = {
    ...feed,
    symbol,
    requestedVolume,
    isAutoTradingEnabled,
    isRobotInterrupted,
    isRobotPaused,
    setRequestedVolume,
    changeSymbol,
    armRobot,
    stopRobot,
  };
  const statusValue = useMemo(() => ({
    symbol,
    isAutoTradingEnabled,
    isRobotPaused,
  }), [isAutoTradingEnabled, isRobotPaused, symbol]);

  return (
    <ScalperRobotStatusContext.Provider value={statusValue}>
      <ScalperRobotContext.Provider value={value}>
        {children}
      </ScalperRobotContext.Provider>
    </ScalperRobotStatusContext.Provider>
  );
}

export function useScalperRobot() {
  const context = useContext(ScalperRobotContext);
  if (!context) {
    throw new Error('useScalperRobot must be used within ScalperRobotProvider');
  }
  return context;
}

export function useScalperRobotStatus() {
  return useContext(ScalperRobotStatusContext);
}
