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
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setSignalsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/market${selectedMarket ? `?type=${selectedMarket}` : ''}`);
        const result = await response.json();
        
        // Load signals in parallel
        fetch(`/api/signals${selectedMarket ? `?market=${selectedMarket}` : ''}`)
          .then(res => res.json())
          .then(res => {
            if (res.success && res.data) setSignals(res.data);
            setSignalsLoading(false);
          })
          .catch(() => setSignalsLoading(false));
        
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
      {/* Trading Signals Section */}
      <div className="mt-8">
        <div className="flex flex-col gap-2 mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Entry Opportunities (Trading Signals)
          </h2>
          <p className="text-muted-foreground text-sm max-w-3xl">
            <strong>Fitur Signal</strong> adalah fitur otomatis yang menganalisis aset-aset paling populer 
            menggunakan algoritma Analisis Teknikal (RSI, MACD, Moving Averages). Fitur ini akan mendeteksi apabila suatu aset 
            sedang berada dalam kondisi <em>Oversold</em> (siap untuk dibeli / <strong>Buy</strong>) atau 
            <em>Overbought</em> (siap untuk dijual / <strong>Sell</strong>).
          </p>
        </div>

        {signalsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DashboardSkeleton />
          </div>
        ) : signals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {signals.map((signal: any) => (
              <Card key={signal.id} className="overflow-hidden border border-border/50 hover:border-primary/50 transition-colors">
                <div className={`h-1 w-full ${signal.type.includes('buy') ? 'bg-green-500' : 'bg-red-500'}`} />
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold">{signal.symbol}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      signal.type.includes('buy') ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {signal.type.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Price at Signal</p>
                      <p className="font-mono text-lg font-semibold">${signal.priceAtSignal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-1">Strength</p>
                      <p className="font-bold">{signal.score}/100</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-lg p-8 border border-border text-center">
            <p className="text-muted-foreground">Tidak ada sinyal kuat yang terdeteksi saat ini.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
