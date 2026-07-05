'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMarketStore } from '@/stores/market-store';
import { MARKET_TYPES } from '@/lib/constants';
import { MarketType } from '@/types/market';

export function MarketSelector() {
  const { selectedMarket, setSelectedMarket } = useMarketStore();

  return (
    <Tabs value={selectedMarket} onValueChange={(v) => setSelectedMarket(v as MarketType)}>
      <TabsList className="bg-muted/50">
        {MARKET_TYPES.map((mt) => (
          <TabsTrigger key={mt.value} value={mt.value} className="gap-1.5 data-[state=active]:bg-background">
            <span>{mt.icon}</span>
            <span>{mt.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
