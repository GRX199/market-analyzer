'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMarketStore } from '@/stores/market-store';
import { MARKET_TYPES } from '@/lib/constants';

export function MarketSelector() {
  const { selectedMarket, setSelectedMarket } = useMarketStore();

  return (
    <Tabs value={selectedMarket} onValueChange={(value) => setSelectedMarket(value as typeof selectedMarket)}>
      <TabsList aria-label="Kategori pasar" className="bg-muted/50 w-full sm:w-auto">
        {MARKET_TYPES.map((mt) => (
          <TabsTrigger key={mt.value} value={mt.value} className="gap-1.5 data-[state=active]:bg-background">
            <span>{mt.value === 'all' ? 'Semua' : mt.value === 'stocks' ? 'Saham' : mt.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
