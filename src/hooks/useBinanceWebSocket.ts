import { useState, useEffect, useRef, useCallback } from 'react';

export type TradeStreamData = {
  price: number;
  qty: number;
  isBuyerMaker: boolean; // if true, it's a SELL order (maker was buyer, taker sold to them)
  time: number;
};

export type OrderBookData = {
  bids: [number, number][]; // [price, qty]
  asks: [number, number][]; // [price, qty]
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
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!symbol) return;
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const formattedSymbol = symbol.replace('/', '').toLowerCase();
    
    // Connect to multiple streams: trade (every execution), kline_1m, and depth5 (100ms update)
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
            return newTrades.slice(0, 50); // Keep last 50 trades for tape
          });
        } 
        else if (stream.endsWith('@kline_1m')) {
          const k = data.k;
          setCurrentKline({
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isFinal: k.x,
            startTime: k.t
          });
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

  return { currentPrice, recentTrades, orderBook, currentKline, isConnected, reconnect: connect };
}
