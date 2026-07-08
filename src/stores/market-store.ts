import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MarketType, Timeframe } from '@/types/market';

interface MarketState {
  selectedMarket: MarketType | 'all';
  selectedSymbol: string | null;
  selectedTimeframe: Timeframe;
  searchQuery: string;
  analysisMode: 'technical' | 'combined';
  setSelectedMarket: (market: MarketType | 'all') => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setSearchQuery: (query: string) => void;
  setAnalysisMode: (mode: 'technical' | 'combined') => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      selectedMarket: 'all',
      selectedSymbol: null,
      selectedTimeframe: '1D',
      searchQuery: '',
      analysisMode: 'combined',
      setSelectedMarket: (market) => set({ selectedMarket: market }),
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
      setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setAnalysisMode: (mode) => set({ analysisMode: mode }),
    }),
    {
      name: 'market-store',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return localStorage;
        // SSR fallback — a no-op storage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      skipHydration: true,
    }
  )
);
