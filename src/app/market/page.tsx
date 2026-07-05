'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { AssetCard } from '@/components/market/asset-card';
import { MarketSelector } from '@/components/market/market-selector';
import { AssetData } from '@/types/market';
import { useMarketStore } from '@/stores/market-store';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';

export default function MarketPage() {
  const { selectedMarket } = useMarketStore();
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const response = await fetch(`/api/market${selectedMarket ? `?type=${selectedMarket}` : ''}`);
        const result = await response.json();
        if (result.success && result.data) {
          setAssets(result.data);
        }
      } catch (error) {
        console.error('Failed to load assets', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedMarket]);

  const filteredAssets = assets.filter(a => 
    a.symbol.toLowerCase().includes(localSearch.toLowerCase()) || 
    a.name.toLowerCase().includes(localSearch.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">Market Explorer</h1>
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <MarketSelector />
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter assets..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredAssets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <AssetCard key={asset.symbol} asset={asset} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No assets found"
          description={`No assets match "${localSearch}" in the ${selectedMarket} market.`}
        />
      )}
    </DashboardLayout>
  );
}
