import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MarketType, Timeframe } from '@/types/market';

interface MarketState {
  selectedMarket: MarketType;
  selectedSymbol: string | null;
  selectedTimeframe: Timeframe;
  searchQuery: string;
  setSelectedMarket: (market: MarketType) => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedTimeframe: (timeframe: Timeframe) => void;
  setSearchQuery: (query: string) => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      selectedMarket: 'crypto',
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
