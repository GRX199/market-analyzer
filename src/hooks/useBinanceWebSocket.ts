import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BINANCE_HISTORY_LIMIT,
  BINANCE_MAX_RECONNECT_ATTEMPTS,
  getBinanceReconnectDelay,
  hasSufficientClosedHistory,
  mergeClosedKlines,
  parseBinanceRestKlines,
  parseBinanceStreamKline,
  type KlineData,
} from '@/lib/scalping/binance-feed';

export type { KlineData };

export type TradeStreamData = {
  price: number;
  qty: number;
  isBuyerMaker: boolean;
  time: number;
};

export type OrderBookData = {
  bids: [number, number][];
  asks: [number, number][];
};

interface BinanceCombinedMessage {
  stream?: unknown;
  data?: unknown;
}

const EMPTY_ORDER_BOOK: OrderBookData = { bids: [], asks: [] };

function parseOrderBookSide(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((level) => {
    if (!Array.isArray(level) || level.length < 2) return [];
    const price = Number(level[0]);
    const quantity = Number(level[1]);
    return Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity >= 0
      ? [[price, quantity] as [number, number]]
      : [];
  });
}

export function useBinanceWebSocket(symbol: string, enabled = true) {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [recentTrades, setRecentTrades] = useState<TradeStreamData[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookData>(EMPTY_ORDER_BOOK);
  const [currentKline, setCurrentKline] = useState<KlineData | null>(null);
  const [klineHistory, setKlineHistory] = useState<KlineData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isBackfillComplete, setIsBackfillComplete] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectExhausted, setReconnectExhausted] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [feedSymbol, setFeedSymbol] = useState(symbol);

  const generationRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableConnectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const backfillAbortRef = useRef<AbortController | null>(null);
  const backfillReadyRef = useRef(false);
  const connectCurrentGenerationRef = useRef<() => void>(() => {});

  const clearSocketTimers = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    if (stableConnectionTimerRef.current) clearTimeout(stableConnectionTimerRef.current);
    reconnectTimerRef.current = null;
    connectionTimerRef.current = null;
    stableConnectionTimerRef.current = null;
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setReconnectExhausted(false);
    setConnectionError(null);
    clearSocketTimers();

    const currentSocket = wsRef.current;
    if (currentSocket) {
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      currentSocket.close();
      wsRef.current = null;
    }
    connectCurrentGenerationRef.current();
  }, [clearSocketTimers]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let stopped = false;
    const formattedSymbol = symbol.replace('/', '').toLowerCase();
    const streamUrl =
      `wss://stream.binance.com:9443/stream?streams=${formattedSymbol}@trade/`
      + `${formattedSymbol}@kline_1m/${formattedSymbol}@depth5@100ms`;

    clearSocketTimers();
    backfillAbortRef.current?.abort();
    reconnectAttemptRef.current = 0;

    const previousSocket = wsRef.current;
    if (previousSocket) {
      previousSocket.onopen = null;
      previousSocket.onmessage = null;
      previousSocket.onerror = null;
      previousSocket.onclose = null;
      previousSocket.close();
      wsRef.current = null;
    }

    const isCurrentGeneration = () => (
      !stopped && generationRef.current === generation
    );

    const loadClosedHistory = async () => {
      backfillAbortRef.current?.abort();
      const abortController = new AbortController();
      backfillAbortRef.current = abortController;
      const timeoutId = globalThis.setTimeout(() => abortController.abort(), 10_000);

      if (isCurrentGeneration()) {
        backfillReadyRef.current = false;
        setIsBackfillComplete(false);
      }

      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(formattedSymbol.toUpperCase())}`
          + `&interval=1m&limit=${BINANCE_HISTORY_LIMIT}`,
          {
            cache: 'no-store',
            signal: abortController.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`Binance history returned HTTP ${response.status}.`);
        }

        const payload: unknown = await response.json();
        const closedHistory = parseBinanceRestKlines(payload);
        if (!hasSufficientClosedHistory(closedHistory)) {
          throw new Error('Binance history did not contain enough finalized candles.');
        }
        if (!isCurrentGeneration()) return;
        setKlineHistory((current) => mergeClosedKlines(current, closedHistory));
        backfillReadyRef.current = true;
        setIsBackfillComplete(true);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          setConnectionError(null);
        }
      } catch (error) {
        if (!abortController.signal.aborted && isCurrentGeneration()) {
          console.error('[Binance REST] Closed-candle backfill failed:', error);
          backfillReadyRef.current = false;
          setIsBackfillComplete(false);
          setConnectionError('Riwayat candle final belum lengkap; robot tetap terkunci hingga sinkronisasi berhasil.');
        }
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    };

    const scheduleReconnect = () => {
      if (!isCurrentGeneration() || reconnectTimerRef.current) return;
      if (reconnectAttemptRef.current >= BINANCE_MAX_RECONNECT_ATTEMPTS) {
        setReconnectExhausted(true);
        setConnectionError('Batas reconnect Binance tercapai. Gunakan tombol reconnect manual.');
        return;
      }

      const nextAttempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = nextAttempt;
      setReconnectAttempt(nextAttempt);
      const delay = getBinanceReconnectDelay(nextAttempt);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectCurrentGenerationRef.current();
      }, delay);
    };

    const connectCurrentGeneration = () => {
      if (!isCurrentGeneration() || !formattedSymbol) return;

      void loadClosedHistory();
      let ws: WebSocket;
      try {
        ws = new WebSocket(streamUrl);
      } catch (error) {
        console.error('[Binance WS] Connection initialization failed:', error);
        setConnectionError('Koneksi market gagal dimulai.');
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;
      const isCurrentSocket = () => (
        isCurrentGeneration() && wsRef.current === ws
      );

      connectionTimerRef.current = setTimeout(() => {
        if (isCurrentSocket() && ws.readyState === WebSocket.CONNECTING) {
          setConnectionError('Koneksi market timeout.');
          ws.close();
        }
      }, 15_000);

      ws.onopen = () => {
        if (!isCurrentSocket()) return;
        if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = null;
        setIsConnected(true);
        setReconnectExhausted(false);
        if (backfillReadyRef.current) setConnectionError(null);
        setRecentTrades([]);

        if (stableConnectionTimerRef.current) {
          clearTimeout(stableConnectionTimerRef.current);
        }
        stableConnectionTimerRef.current = setTimeout(() => {
          if (!isCurrentSocket()) return;
          reconnectAttemptRef.current = 0;
          setReconnectAttempt(0);
        }, 60_000);
      };

      ws.onmessage = (event) => {
        if (!isCurrentSocket()) return;
        try {
          const message = JSON.parse(String(event.data)) as BinanceCombinedMessage;
          const stream = typeof message.stream === 'string' ? message.stream : '';
          const data = typeof message.data === 'object' && message.data !== null
            ? message.data as Record<string, unknown>
            : null;
          if (!data) return;

          if (stream.endsWith('@trade')) {
            const price = Number(data.p);
            const qty = Number(data.q);
            const time = Number(data.T);
            const isBuyerMaker = data.m === true;
            if (
              !Number.isFinite(price)
              || price <= 0
              || !Number.isFinite(qty)
              || qty < 0
              || !Number.isFinite(time)
            ) {
              return;
            }

            setCurrentPrice(price);
            setRecentTrades((current) => (
              [{ price, qty, isBuyerMaker, time }, ...current].slice(0, 200)
            ));
          } else if (stream.endsWith('@kline_1m')) {
            const kline = parseBinanceStreamKline(data.k);
            if (!kline) return;
            setCurrentKline(kline);
            if (kline.isFinal) {
              setKlineHistory((current) => mergeClosedKlines(current, [kline]));
            }
          } else if (stream.endsWith('@depth5@100ms')) {
            setOrderBook({
              bids: parseOrderBookSide(data.bids),
              asks: parseOrderBookSide(data.asks),
            });
          }
        } catch (error) {
          console.error('[Binance WS] Invalid stream payload:', error);
        }
      };

      ws.onerror = () => {
        if (!isCurrentSocket()) return;
        setConnectionError('Feed Binance mengalami gangguan.');
        ws.close();
      };

      ws.onclose = () => {
        if (!isCurrentSocket()) return;
        if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
        if (stableConnectionTimerRef.current) clearTimeout(stableConnectionTimerRef.current);
        connectionTimerRef.current = null;
        stableConnectionTimerRef.current = null;
        wsRef.current = null;
        setIsConnected(false);
        scheduleReconnect();
      };
    };

    connectCurrentGenerationRef.current = enabled
      ? connectCurrentGeneration
      : () => {};
    // Start on the next task so the symbol-reset state updates are not made
    // synchronously from the effect body. It also gives cleanup a chance to
    // cancel a stale start during a rapid symbol change.
    const initialStartTimer = globalThis.setTimeout(() => {
      if (!isCurrentGeneration()) return;
      setFeedSymbol(symbol);
      setCurrentPrice(0);
      setRecentTrades([]);
      setOrderBook(EMPTY_ORDER_BOOK);
      setCurrentKline(null);
      setKlineHistory([]);
      setIsConnected(false);
      backfillReadyRef.current = false;
      setIsBackfillComplete(false);
      setReconnectAttempt(0);
      setReconnectExhausted(false);
      setConnectionError(null);
      if (enabled) connectCurrentGeneration();
    }, 0);

    return () => {
      stopped = true;
      globalThis.clearTimeout(initialStartTimer);
      clearSocketTimers();
      backfillAbortRef.current?.abort();
      backfillAbortRef.current = null;
      backfillReadyRef.current = false;
      connectCurrentGenerationRef.current = () => {};

      const socket = wsRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        wsRef.current = null;
      }
    };
  }, [clearSocketTimers, enabled, symbol]);

  return {
    currentPrice,
    recentTrades,
    orderBook,
    currentKline,
    klineHistory,
    isConnected,
    isBackfillComplete,
    reconnectAttempt,
    reconnectExhausted,
    connectionError,
    feedSymbol,
    reconnect,
  };
}
