'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { AssetCard } from '@/components/market/asset-card';
import { EmptyState } from '@/components/common/empty-state';
import { useUserStore } from '@/stores/user-store';
import { AssetData } from '@/types/market';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function WatchlistPage() {
  const { watchlist } = useUserStore();
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWatchlistData() {
      if (watchlist.length === 0) {
        setAssets([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const promises = watchlist.map(async (item) => {
          const res = await fetch(`/api/market/${encodeURIComponent(item.symbol)}`);
          const result = await res.json();
          if (result.success && result.data && result.data.asset) {
            return result.data.asset;
          }
          return null;
        });
        
        const results = await Promise.all(promises);
        const validAssets = results.filter((a): a is AssetData => a !== null);
        
        setAssets(validAssets);
      } catch (error) {
        console.error('Failed to load watchlist assets', error);
      } finally {
        setLoading(false);
      }
    }

    loadWatchlistData();
  }, [watchlist]);

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Watchlist</h1>
        <p className="text-muted-foreground">Monitor your favorite assets across all markets.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : assets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map(asset => (
            <AssetCard key={asset.symbol} asset={asset} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Star}
          title="Your watchlist is empty"
          description="You haven't added any assets to your watchlist yet. Browse the market to find assets to track."
          action={
            <Link href="/market">
              <Button className="mt-4">Explore Market</Button>
            </Link>
          }
        />
      )}
    </DashboardLayout>
  );
}
