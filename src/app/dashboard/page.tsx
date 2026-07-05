'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { DashboardSkeleton } from '@/components/common/loading-skeleton';
import { AssetCard } from '@/components/market/asset-card';
import { MarketSelector } from '@/components/market/market-selector';
import { MarketOverview, MarketType, AssetData } from '@/types/market';
import { useMarketStore } from '@/stores/market-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight, Activity, TrendingUp, TrendingDown } from 'lucide-react';

export default function DashboardPage() {
  const { selectedMarket } = useMarketStore();
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/market${selectedMarket ? `?type=${selectedMarket}` : ''}`);
        const result = await response.json();
        
        if (result.success && result.data) {
          const assets: AssetData[] = result.data;
          const activeAssets = assets.filter(a => a.price > 0);
          
          setOverview({
            marketType: selectedMarket || 'crypto',
            totalAssets: activeAssets.length > 0 ? activeAssets.length : assets.length,
            bullishCount: activeAssets.filter(a => a.trend === 'bullish').length,
            bearishCount: activeAssets.filter(a => a.trend === 'bearish').length,
            sidewaysCount: activeAssets.filter(a => a.trend === 'sideways').length,
            topGainers: [...activeAssets].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3),
            topLosers: [...activeAssets].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3),
            mostActive: [...activeAssets].sort((a, b) => b.volume - a.volume).slice(0, 3),
          });
        } else {
          setError(result.error || 'Failed to load market data');
        }
      } catch (err) {
        console.error('Failed to load market overview', err);
        setError('Cannot connect to server. Please check your connection.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedMarket]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Market Dashboard</h1>
          <MarketSelector />
        </div>
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  if (error || !overview) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Market Dashboard</h1>
          <MarketSelector />
        </div>
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-6 text-center">
            <Activity className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
            <p className="font-semibold text-lg mb-1">Data Loading Issue</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'No market data available. The API might be initializing.'}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const marketTrend = overview.bullishCount > overview.bearishCount ? 'Bullish' : 'Bearish';
  const marketTrendColor = marketTrend === 'Bullish' ? 'text-green-500' : 'text-red-500';

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Market Dashboard</h1>
        <MarketSelector />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Trend</CardTitle>
            <TrendingUp className={`h-4 w-4 ${marketTrendColor}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${marketTrendColor}`}>{marketTrend}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {overview.totalAssets} assets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bullish Assets</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{overview.bullishCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((overview.bullishCount / overview.totalAssets) * 100)}% of market
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bearish Assets</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{overview.bearishCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((overview.bearishCount / overview.totalAssets) * 100)}% of market
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sideways Assets</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{overview.sidewaysCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((overview.sidewaysCount / overview.totalAssets) * 100)}% of market
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* Top Gainers */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" /> Top Gainers
            </h2>
          </div>
          {overview.topGainers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overview.topGainers.map(asset => (
                <AssetCard key={asset.symbol} asset={asset} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <p className="text-muted-foreground">Tidak ada data (API Limit / Data Kosong)</p>
            </div>
          )}
        </div>

        {/* Top Losers */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" /> Top Losers
            </h2>
          </div>
          {overview.topLosers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overview.topLosers.map(asset => (
                <AssetCard key={asset.symbol} asset={asset} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <p className="text-muted-foreground">Tidak ada data (API Limit / Data Kosong)</p>
            </div>
          )}
        </div>
      </div>

      {/* Most Active */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" /> Most Active (Volume)
          </h2>
        </div>
        {overview.mostActive.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {overview.mostActive.map(asset => (
              <AssetCard key={asset.symbol} asset={asset} />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-lg p-8 border border-border text-center">
            <p className="text-muted-foreground">Tidak ada data (API Limit / Data Kosong)</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
