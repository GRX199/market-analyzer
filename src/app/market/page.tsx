'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { AssetCard } from '@/components/market/asset-card';
import { MarketSelector } from '@/components/market/market-selector';
import { AssetData } from '@/types/market';
import { useMarketStore } from '@/stores/market-store';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';

export default function MarketPage() {
  const { selectedMarket } = useMarketStore();
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/market${selectedMarket ? `?type=${selectedMarket}` : ''}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error('Data pasar belum tersedia. Coba muat ulang.');
        if (!controller.signal.aborted) setAssets(result.data);
      } catch (error) {
        if (!controller.signal.aborted) { setAssets([]); setError('Data pasar belum dapat dimuat. Periksa koneksi, lalu coba lagi.'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadData();
    return () => controller.abort();
  }, [selectedMarket, attempt]);

  const filteredAssets = assets.filter(a => 
    a.symbol.toLowerCase().includes(localSearch.toLowerCase()) || 
    a.name.toLowerCase().includes(localSearch.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-primary">Jelajah pasar</p>
        <h1 className="mb-2">Semua pasar</h1>
        <p className="mb-6 text-sm text-muted-foreground">Cari instrumen, pantau harga, dan simpan aset ke daftar pantauan.</p>
        <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-end rounded-xl border bg-card p-4">
          <MarketSelector />
          <div className="w-full xl:w-72"><label htmlFor="market-search" className="mb-2 block text-sm font-medium">Cari aset</label><div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="market-search"
              placeholder="Nama atau simbol, mis. XAU"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9"
            />
          </div></div>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border bg-card p-6"><p>{error}</p><Button variant="outline" className="mt-4" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="size-4" />Muat ulang pasar</Button></div> : loading ? (
        <div role="status" aria-label="Memuat data pasar" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredAssets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <AssetCard key={asset.symbol} asset={asset} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aset tidak ditemukan"
          description={localSearch ? `Tidak ada aset yang cocok dengan “${localSearch}”. Coba simbol atau nama lain.` : 'Belum ada data pada kategori ini. Pilih kategori pasar lainnya.'}
        />
      )}
    </DashboardLayout>
  );
}
