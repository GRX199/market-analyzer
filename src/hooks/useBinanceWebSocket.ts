import { useState, useEffect, useRef, useCallback } from 'react';

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

export type KlineData = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
  startTime: number;
};

export function useBinanceWebSocket(symbol: string) {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [recentTrades, setRecentTrades] = useState<TradeStreamData[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookData>({ bids: [], asks: [] });
  const [currentKline, setCurrentKline] = useState<KlineData | null>(null);
  const [klineHistory, setKlineHistory] = useState<KlineData[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!symbol) return;
    
    if (wsRef.current) {
      wsRef.current.close();
    }

    const formattedSymbol = symbol.replace('/', '').toLowerCase();
    
    // Connect to multiple streams
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${formattedSymbol}@trade/${formattedSymbol}@kline_1m/${formattedSymbol}@depth5@100ms`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[Binance WS] Connected to ${formattedSymbol}`);
      setIsConnected(true);
      setRecentTrades([]);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const stream = payload.stream;
        const data = payload.data;

        if (stream.endsWith('@trade')) {
          const price = parseFloat(data.p);
          const qty = parseFloat(data.q);
          const time = data.T;
          const isBuyerMaker = data.m;
          
          setCurrentPrice(price);
          
          setRecentTrades(prev => {
            const newTrades = [{ price, qty, isBuyerMaker, time }, ...prev];
            return newTrades.slice(0, 200);
          });
        } 
        else if (stream.endsWith('@kline_1m')) {
          const k = data.k;
          const kline: KlineData = {
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: k.x,
            startTime: k.t
          };
          
          setCurrentKline(kline);
          
          // Ketika candle selesai (isFinal = true), simpan ke riwayat
          if (kline.isFinal) {
            setKlineHistory(prev => {
              const exists = prev.some(h => h.startTime === kline.startTime);
              if (exists) return prev;
              const newHistory = [...prev, kline];
              return newHistory.slice(-30); // Simpan 30 candle terakhir untuk EMA/RSI
            });
          }
        }
        else if (stream.endsWith('@depth5@100ms')) {
          setOrderBook({
            bids: data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
            asks: data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])])
          });
        }
      } catch (err) {
        console.error("[Binance WS] Parse Error", err);
      }
    };

    ws.onclose = () => {
      console.log(`[Binance WS] Disconnected from ${formattedSymbol}`);
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[Binance WS] Error", error);
      setIsConnected(false);
    };

  }, [symbol]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { currentPrice, recentTrades, orderBook, currentKline, klineHistory, isConnected, reconnect: connect };
}
