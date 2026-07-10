import { create } from 'zustand';

interface PriceData {
  current: number;
  previous: number;
  timestamp: number;
}

interface RealtimeState {
  prices: Record<string, PriceData>;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout;

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  prices: {},
  isConnected: false,
  isConnecting: false,

  connect: () => {
    const { isConnected, isConnecting } = get();
    if (isConnected || isConnecting || typeof window === 'undefined') return;

    set({ isConnecting: true });

    // Use Binance's !miniTicker@arr to get all crypto prices efficiently (~1s updates)
    const wsUrl = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
    
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        set({ isConnected: true, isConnecting: false });
        console.log('Real-time market data connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            set((state) => {
              const newPrices = { ...state.prices };
              let hasChanges = false;
              
              const now = Date.now();
              data.forEach((ticker: any) => {
                const symbol = ticker.s; // e.g., "BTCUSDT"
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
        } catch (err) {
          // Ignore parsing errors for individual frames
        }
      };

      ws.onclose = () => {
        set({ isConnected: false, isConnecting: false });
        // Auto reconnect after 3 seconds
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          get().connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws?.close();
      };
    } catch (err) {
      set({ isConnecting: false });
      console.error('Failed to establish WebSocket:', err);
    }
  },

  disconnect: () => {
    clearTimeout(reconnectTimeout);
    if (ws) {
      ws.close();
      ws = null;
    }
    set({ isConnected: false, isConnecting: false });
  },
}));
