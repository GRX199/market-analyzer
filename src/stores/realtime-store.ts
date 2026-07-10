import { create } from 'zustand';

interface PriceData {
  current: number;
  previous: number;
  timestamp: number;
}

interface RealtimeState {
  prices: Record<string, PriceData>;
  isCryptoConnected: boolean;
  isStocksConnected: boolean;
  
  // To track which stocks/forex are currently needed on screen
  activeSymbols: {
    stocks: Set<string>;
    forex: Set<string>;
  };
  
  connectCrypto: () => void;
  connectStocks: (apiKey: string) => void;
  startForexPolling: () => void;
  
  subscribeSymbol: (symbol: string, type: 'crypto' | 'stocks' | 'forex') => void;
  unsubscribeSymbol: (symbol: string, type: 'crypto' | 'stocks' | 'forex') => void;
  
  disconnect: () => void;
}

let cryptoWs: WebSocket | null = null;
let stocksWs: WebSocket | null = null;
let cryptoReconnectTimeout: NodeJS.Timeout;
let stocksReconnectTimeout: NodeJS.Timeout;
let forexPollingInterval: NodeJS.Timeout | null = null;

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  prices: {},
  isCryptoConnected: false,
  isStocksConnected: false,
  activeSymbols: {
    stocks: new Set(),
    forex: new Set(),
  },

  subscribeSymbol: (symbol, type) => {
    if (type === 'crypto') return; // Crypto gets all via !miniTicker
    
    const { activeSymbols, isStocksConnected } = get();
    if (type === 'stocks') {
      activeSymbols.stocks.add(symbol);
      if (isStocksConnected && stocksWs?.readyState === WebSocket.OPEN) {
        stocksWs.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
    } else if (type === 'forex') {
      activeSymbols.forex.add(symbol);
      // Poller will automatically pick it up
    }
  },

  unsubscribeSymbol: (symbol, type) => {
    if (type === 'crypto') return;
    
    const { activeSymbols, isStocksConnected } = get();
    if (type === 'stocks') {
      activeSymbols.stocks.delete(symbol);
      if (isStocksConnected && stocksWs?.readyState === WebSocket.OPEN) {
        stocksWs.send(JSON.stringify({ type: 'unsubscribe', symbol }));
      }
    } else if (type === 'forex') {
      activeSymbols.forex.delete(symbol);
    }
  },

  connectCrypto: () => {
    const { isCryptoConnected } = get();
    if (isCryptoConnected || typeof window === 'undefined') return;

    try {
      cryptoWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
      
      cryptoWs.onopen = () => set({ isCryptoConnected: true });
      
      cryptoWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            set((state) => {
              const newPrices = { ...state.prices };
              let hasChanges = false;
              const now = Date.now();
              
              data.forEach((ticker: any) => {
                const symbol = ticker.s; // BTCUSDT
                const price = parseFloat(ticker.c);
                const existing = newPrices[symbol];
                
                if (!existing || existing.current !== price) {
                  newPrices[symbol] = {
                    current: price,
                    previous: existing ? existing.current : price,
                    timestamp: now,
                  };
                  hasChanges = true;
                }
              });
              
              return hasChanges ? { prices: newPrices } : state;
            });
          }
        } catch (err) {}
      };

      cryptoWs.onclose = () => {
        set({ isCryptoConnected: false });
        clearTimeout(cryptoReconnectTimeout);
        cryptoReconnectTimeout = setTimeout(() => get().connectCrypto(), 3000);
      };
      
      cryptoWs.onerror = () => cryptoWs?.close();
    } catch (err) {}
  },

  connectStocks: (apiKey: string) => {
    const { isStocksConnected, activeSymbols } = get();
    if (isStocksConnected || typeof window === 'undefined' || !apiKey) return;

    try {
      stocksWs = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
      
      stocksWs.onopen = () => {
        set({ isStocksConnected: true });
        // Subscribe to all currently active stock symbols
        activeSymbols.stocks.forEach(symbol => {
          stocksWs?.send(JSON.stringify({ type: 'subscribe', symbol }));
        });
      };
      
      stocksWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'trade' && data.data) {
            set((state) => {
              const newPrices = { ...state.prices };
              let hasChanges = false;
              const now = Date.now();
              
              data.data.forEach((trade: any) => {
                const symbol = trade.s; // AAPL
                const price = parseFloat(trade.p);
                const existing = newPrices[symbol];
                
                if (!existing || existing.current !== price) {
                  newPrices[symbol] = {
                    current: price,
                    previous: existing ? existing.current : price,
                    timestamp: now,
                  };
                  hasChanges = true;
                }
              });
              
              return hasChanges ? { prices: newPrices } : state;
            });
          }
        } catch (err) {}
      };

      stocksWs.onclose = () => {
        set({ isStocksConnected: false });
        clearTimeout(stocksReconnectTimeout);
        stocksReconnectTimeout = setTimeout(() => get().connectStocks(apiKey), 3000);
      };
      
      stocksWs.onerror = () => stocksWs?.close();
    } catch (err) {}
  },

  startForexPolling: () => {
    if (forexPollingInterval || typeof window === 'undefined') return;
    
    // Poll every 10 seconds
    forexPollingInterval = setInterval(async () => {
      const { activeSymbols } = get();
      if (activeSymbols.forex.size === 0) return;
      
      const symbolsList = Array.from(activeSymbols.forex).join(',');
      
      try {
        const res = await fetch(`/api/proxy/forex?symbols=${encodeURIComponent(symbolsList)}`);
        if (res.ok) {
          const pricesMap = await res.json();
          
          set((state) => {
            const newPrices = { ...state.prices };
            let hasChanges = false;
            const now = Date.now();
            
            Object.entries(pricesMap).forEach(([symbol, priceStr]) => {
              const price = parseFloat(priceStr as string);
              const existing = newPrices[symbol];
              
              if (!existing || existing.current !== price) {
                newPrices[symbol] = {
                  current: price,
                  previous: existing ? existing.current : price,
                  timestamp: now,
                };
                hasChanges = true;
              }
            });
            
            return hasChanges ? { prices: newPrices } : state;
          });
        }
      } catch (err) {
        console.error('Forex polling failed', err);
      }
    }, 10000);
  },

  disconnect: () => {
    clearTimeout(cryptoReconnectTimeout);
    clearTimeout(stocksReconnectTimeout);
    if (forexPollingInterval) clearInterval(forexPollingInterval);
    forexPollingInterval = null;
    
    if (cryptoWs) { cryptoWs.close(); cryptoWs = null; }
    if (stocksWs) { stocksWs.close(); stocksWs = null; }
    
    set({ isCryptoConnected: false, isStocksConnected: false });
  },
}));
