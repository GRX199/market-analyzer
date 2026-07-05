import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MarketType, Timeframe } from '@/types/market';

interface MarketState {
  selectedMarket: MarketType | 'all';
  selectedSymbol: string | null;
  selectedTimeframe: Timeframe;
  searchQuery: string;
  setSelectedMarket: (market: MarketType | 'all') => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setSearchQuery: (query: string) => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      selectedMarket: 'all',
      selectedSymbol: null,
      selectedTimeframe: '1D',
      searchQuery: '',
      setSelectedMarket: (market) => set({ selectedMarket: market }),
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
      setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),
      setSearchQuery: (query) => set({ searchQuery: query }),
    }),
    { name: 'market-store' }
  )
);
