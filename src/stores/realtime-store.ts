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
let forexPollingAbortController: AbortController | null = null;
let isForexPolling = false;

const FOREX_REQUEST_BATCH_SIZE = 20;
const FOREX_POLL_INTERVAL_MS = 10_000;

let isCryptoConnecting = false;
let isStocksConnecting = false;
const stockSubscriptionCounts = new Map<string, number>();
const forexSubscriptionCounts = new Map<string, number>();

function addSubscription(
  subscriptions: Map<string, number>,
  symbol: string,
): boolean {
  const nextCount = (subscriptions.get(symbol) ?? 0) + 1;
  subscriptions.set(symbol, nextCount);
  return nextCount === 1;
}

function removeSubscription(
  subscriptions: Map<string, number>,
  symbol: string,
): boolean {
  const currentCount = subscriptions.get(symbol) ?? 0;
  if (currentCount <= 1) {
    subscriptions.delete(symbol);
    return currentCount === 1;
  }
  subscriptions.set(symbol, currentCount - 1);
  return false;
}

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
      if (!addSubscription(stockSubscriptionCounts, symbol)) return;
      activeSymbols.stocks.add(symbol);
      if (isStocksConnected && stocksWs?.readyState === WebSocket.OPEN) {
        stocksWs.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
    } else if (type === 'forex') {
      if (!addSubscription(forexSubscriptionCounts, symbol)) return;
      activeSymbols.forex.add(symbol);
      // Poller will automatically pick it up
    }
  },

  unsubscribeSymbol: (symbol, type) => {
    if (type === 'crypto') return;
    
    const { activeSymbols, isStocksConnected } = get();
    if (type === 'stocks') {
      if (!removeSubscription(stockSubscriptionCounts, symbol)) return;
      activeSymbols.stocks.delete(symbol);
      if (isStocksConnected && stocksWs?.readyState === WebSocket.OPEN) {
        stocksWs.send(JSON.stringify({ type: 'unsubscribe', symbol }));
      }
    } else if (type === 'forex') {
      if (!removeSubscription(forexSubscriptionCounts, symbol)) return;
      activeSymbols.forex.delete(symbol);
    }
  },

  connectCrypto: () => {
    const { isCryptoConnected } = get();
    if (isCryptoConnected || isCryptoConnecting || typeof window === 'undefined') return;

    isCryptoConnecting = true;
    try {
      cryptoWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
      
      cryptoWs.onopen = () => {
        isCryptoConnecting = false;
        set({ isCryptoConnected: true });
      };
      
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
        isCryptoConnecting = false;
        set({ isCryptoConnected: false });
        clearTimeout(cryptoReconnectTimeout);
        cryptoReconnectTimeout = setTimeout(() => get().connectCrypto(), 5000);
      };
      
      cryptoWs.onerror = () => cryptoWs?.close();
    } catch (err) {
      isCryptoConnecting = false;
    }
  },

  connectStocks: (apiKey: string) => {
    const { isStocksConnected, activeSymbols } = get();
    if (isStocksConnected || isStocksConnecting || typeof window === 'undefined' || !apiKey) return;

    isStocksConnecting = true;
    try {
      stocksWs = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
      
      stocksWs.onopen = () => {
        isStocksConnecting = false;
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
        isStocksConnecting = false;
        set({ isStocksConnected: false });
        clearTimeout(stocksReconnectTimeout);
        stocksReconnectTimeout = setTimeout(() => get().connectStocks(apiKey), 5000);
      };
      
      stocksWs.onerror = () => stocksWs?.close();
    } catch (err) {
      isStocksConnecting = false;
    }
  },

  startForexPolling: () => {
    if (forexPollingInterval || typeof window === 'undefined') return;

    const pollForexPrices = async () => {
      if (isForexPolling) return;
      const { activeSymbols } = get();
      if (activeSymbols.forex.size === 0) return;

      isForexPolling = true;
      const controller = new AbortController();
      forexPollingAbortController = controller;
      try {
        const symbols = Array.from(activeSymbols.forex);
        const batches: string[][] = [];
        for (let index = 0; index < symbols.length; index += FOREX_REQUEST_BATCH_SIZE) {
          batches.push(symbols.slice(index, index + FOREX_REQUEST_BATCH_SIZE));
        }

        const batchResults = await Promise.allSettled(
          batches.map(async (batch) => {
            const response = await fetch(
              `/api/proxy/forex?symbols=${encodeURIComponent(batch.join(','))}`,
              { cache: 'no-store', signal: controller.signal },
            );
            if (!response.ok) return null;
            return response.json() as Promise<unknown>;
          }),
        );
        const successfulPayloads = batchResults.flatMap((result) => (
          result.status === 'fulfilled' && result.value !== null ? [result.value] : []
        ));

        const pricesMap: Record<string, number> = {};
        for (const payload of successfulPayloads) {
          if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
            continue;
          }
          for (const [symbol, rawPrice] of Object.entries(payload)) {
            const price = Number(rawPrice);
            if (Number.isFinite(price) && price > 0) {
              pricesMap[symbol] = price;
            }
          }
        }

        if (Object.keys(pricesMap).length > 0) {
          set((state) => {
            const newPrices = { ...state.prices };
            let hasChanges = false;
            const now = Date.now();

            Object.entries(pricesMap).forEach(([symbol, price]) => {
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
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Forex polling failed', error);
        }
      } finally {
        if (forexPollingAbortController === controller) {
          forexPollingAbortController = null;
          isForexPolling = false;
        }
      }
    };

    void pollForexPrices();
    forexPollingInterval = setInterval(
      () => void pollForexPrices(),
      FOREX_POLL_INTERVAL_MS,
    );
  },

  disconnect: () => {
    clearTimeout(cryptoReconnectTimeout);
    clearTimeout(stocksReconnectTimeout);
    if (forexPollingInterval) clearInterval(forexPollingInterval);
    forexPollingInterval = null;
    forexPollingAbortController?.abort();
    forexPollingAbortController = null;
    isForexPolling = false;
    
    if (cryptoWs) {
      cryptoWs.onopen = null;
      cryptoWs.onmessage = null;
      cryptoWs.onerror = null;
      cryptoWs.onclose = null;
      cryptoWs.close();
      cryptoWs = null;
    }
    if (stocksWs) {
      stocksWs.onopen = null;
      stocksWs.onmessage = null;
      stocksWs.onerror = null;
      stocksWs.onclose = null;
      stocksWs.close();
      stocksWs = null;
    }
    isCryptoConnecting = false;
    isStocksConnecting = false;

    const { activeSymbols } = get();
    activeSymbols.stocks.clear();
    activeSymbols.forex.clear();
    stockSubscriptionCounts.clear();
    forexSubscriptionCounts.clear();
    
    set({ isCryptoConnected: false, isStocksConnected: false });
  },
}));
