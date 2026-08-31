'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { DashboardSkeleton } from '@/components/common/loading-skeleton';
import { AssetCard } from '@/components/market/asset-card';
import { MarketSelector } from '@/components/market/market-selector';
import { MarketOverview, AssetData, Timeframe } from '@/types/market';
import { SignalType } from '@/types/analysis';
import { useMarketStore } from '@/stores/market-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Activity,
  Clock,
  RefreshCw,
  ServerCog,
  Settings2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIMEFRAMES } from '@/lib/constants';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SignalOpportunity {
  id: string;
  symbol: string;
  type: SignalType;
  score: number;
  reasons: string[];
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function fetchApiPayload(url: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload: unknown = await response.json().catch(() => null);
  const row = typeof payload === 'object' && payload !== null
    ? payload as Record<string, unknown>
    : {};
  if (!response.ok) {
    throw new Error(typeof row.error === 'string' ? row.error : `HTTP ${response.status}`);
  }
  return row;
}

function parseSignalOpportunities(value: unknown): SignalOpportunity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return [];
    const row = candidate as Record<string, unknown>;
    const validType = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']
      .includes(String(row.type));
    if (
      typeof row.id !== 'string'
      || typeof row.symbol !== 'string'
      || !validType
      || !Number.isFinite(Number(row.score))
    ) {
      return [];
    }
    return [{
      id: row.id,
      symbol: row.symbol,
      type: row.type as SignalType,
      score: Number(row.score),
      reasons: Array.isArray(row.reasons)
        ? row.reasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
      entryPrice: Number(row.entryPrice) || 0,
      stopLoss: Number(row.stopLoss) || 0,
      takeProfit: Number(row.takeProfit) || 0,
      riskRewardRatio: Number(row.riskRewardRatio) || 0,
    }];
  });
}

export default function DashboardPage() {
  const { selectedMarket, selectedTimeframe, setSelectedTimeframe, analysisMode, setAnalysisMode } = useMarketStore();
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [signals, setSignals] = useState<SignalOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    if (!silent) {
      setLoading(true);
      setSignalsLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    setSignalsError(null);
    try {
      const signalQuery = new URLSearchParams();
      if (selectedMarket && selectedMarket !== 'all') signalQuery.append('market', selectedMarket);
      if (selectedTimeframe) signalQuery.append('timeframe', selectedTimeframe);
      if (analysisMode) signalQuery.append('mode', analysisMode);

      const [marketResult, signalResult] = await Promise.allSettled([
        fetchApiPayload(`/api/market?type=${selectedMarket}`, controller.signal),
        fetchApiPayload(`/api/signals?${signalQuery.toString()}`, controller.signal),
      ]);
      if (controller.signal.aborted) return;

      if (marketResult.status === 'fulfilled' && marketResult.value.success === true && Array.isArray(marketResult.value.data)) {
        const assets = marketResult.value.data as AssetData[];
        const activeAssets = assets.filter(a => a.price > 0);

        setOverview({
          marketType: (selectedMarket === 'all' || !selectedMarket) ? 'crypto' : selectedMarket,
          totalAssets: activeAssets.length > 0 ? activeAssets.length : assets.length,
          bullishCount: activeAssets.filter(a => a.trend === 'bullish').length,
          bearishCount: activeAssets.filter(a => a.trend === 'bearish').length,
          sidewaysCount: activeAssets.filter(a => a.trend === 'sideways').length,
          topGainers: [...activeAssets].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3),
          topLosers: [...activeAssets].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3),
          mostActive: [...activeAssets].sort((a, b) => b.volume - a.volume).slice(0, 3),
        });
      } else {
        const reason = marketResult.status === 'rejected'
          ? marketResult.reason
          : new Error(typeof marketResult.value.error === 'string'
            ? marketResult.value.error
            : 'Respons data pasar tidak valid.');
        setError(errorMessage(reason, 'Data pasar gagal dimuat.'));
      }

      if (signalResult.status === 'fulfilled' && signalResult.value.success === true) {
        setSignals(parseSignalOpportunities(signalResult.value.data));
      } else {
        const reason = signalResult.status === 'rejected'
          ? signalResult.reason
          : new Error(typeof signalResult.value.error === 'string'
            ? signalResult.value.error
            : 'Respons sinyal tidak valid.');
        setSignalsError(errorMessage(reason, 'Sinyal gagal dimuat.'));
      }
      setLastRefresh(new Date());
    } catch (caughtError) {
      if (!(caughtError instanceof DOMException && caughtError.name === 'AbortError')) {
        console.error('Failed to load market overview', caughtError);
        setError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setSignalsLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedMarket, selectedTimeframe, analysisMode]);

  // Initial load and dependency-based reload
  useEffect(() => {
    const initialTimer = globalThis.setTimeout(() => void fetchData(false), 0);
    return () => {
      globalThis.clearTimeout(initialTimer);
      requestControllerRef.current?.abort();
    };
  }, [fetchData]);

  // Auto-refresh every 30 seconds (silent)
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      void fetchData(true);
    }, 30000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchData]);

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

  if (!overview) {
    return (
      <DashboardLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Dashboard Pasar</h1>
          <MarketSelector />
        </div>
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-6 text-center">
            <Activity className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
            <p className="font-semibold text-lg mb-1">Data pasar belum tersedia</p>
            <p className="text-sm text-muted-foreground mb-4">{error || 'Provider data mungkin sedang menyiapkan respons.'}</p>
            <Button onClick={() => void fetchData(false)}>
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const marketTrend = overview.bullishCount === overview.bearishCount
    ? 'Neutral'
    : overview.bullishCount > overview.bearishCount ? 'Bullish' : 'Bearish';
  const marketTrendColor = marketTrend === 'Bullish'
    ? 'text-green-500'
    : marketTrend === 'Bearish' ? 'text-red-500' : 'text-yellow-500';
  const marketPercentage = (count: number) => overview.totalAssets > 0
    ? Math.round((count / overview.totalAssets) * 100)
    : 0;

  return (
    <DashboardLayout>
      <div className="mb-6 overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur md:mb-8 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <span className="h-2 w-2 rounded-full bg-emerald-500 live-pulse-dot" />
              Market intelligence
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard Pasar</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Ringkasan tren lintas aset, pergerakan utama, dan kandidat sinyal dalam satu tampilan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/screener" className={buttonVariants({ variant: 'outline', className: 'rounded-xl' })}>
              Buka penyaring <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/operations" className={buttonVariants({ variant: 'outline', className: 'rounded-xl' })}>
              <ServerCog className="h-4 w-4" /> Robot
            </Link>
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Perbarui
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <MarketSelector />
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Diperbarui {lastRefresh.toLocaleTimeString('id-ID')} · otomatis setiap 30 detik
            </p>
          )}
        </div>
      </div>

      {error && (
        <Alert className="mb-6 border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
          <Activity className="h-4 w-4" />
          <AlertDescription>{error} Data terakhir tetap ditampilkan.</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Trend</CardTitle>
            {marketTrend === 'Neutral'
              ? <Activity className={`h-4 w-4 ${marketTrendColor}`} />
              : <TrendingUp className={`h-4 w-4 ${marketTrendColor}`} />}
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
              {marketPercentage(overview.bullishCount)}% of market
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
              {marketPercentage(overview.bearishCount)}% of market
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
              {marketPercentage(overview.sidewaysCount)}% of market
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-8">
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 md:h-6 md:w-6 text-primary" /> Entry Opportunities
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border w-fit">
                <Settings2 className="h-4 w-4 text-muted-foreground ml-2" />
                <Select
                  value={analysisMode}
                  onValueChange={(value) => setAnalysisMode(value as 'technical' | 'combined')}
                >
                  <SelectTrigger className="h-8 border-0 bg-transparent shadow-none text-xs w-[130px]">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combined">Combined (Overall)</SelectItem>
                    <SelectItem value="technical">Technical Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border w-full sm:w-fit overflow-x-auto">
                <Clock className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
                <Tabs
                  value={selectedTimeframe}
                  onValueChange={(value) => setSelectedTimeframe(value as Timeframe)}
                >
                  <TabsList className="h-8 bg-transparent">
                    {TIMEFRAMES.map(tf => (
                      <TabsTrigger key={tf.value} value={tf.value} className="text-xs px-1.5 md:px-2 h-6 data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">
                        {tf.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-sm max-w-3xl">
            <strong>Fitur Signal</strong> adalah fitur otomatis yang menganalisis aset-aset paling populer 
            menggunakan algoritma Analisis Teknikal (RSI, MACD, Moving Averages). Fitur ini akan mendeteksi apabila suatu aset 
            sedang berada dalam kondisi <em>Oversold</em> atau <em>Overbought</em> sebagai kandidat
            peninjauan. Kondisi tersebut bukan instruksi transaksi dan tetap dapat berlanjut melawan posisi.
          </p>
        </div>

        {signalsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DashboardSkeleton />
          </div>
        ) : signals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.map((signal) => (
              <Link href={`/asset/${encodeURIComponent(signal.symbol)}`} key={signal.id}>
                <Card className="overflow-hidden border border-border/50 hover:border-primary/50 transition-colors h-full cursor-pointer">
                  <div className={`h-1 w-full ${signal.type.includes('buy') ? 'bg-green-500' : 'bg-red-500'}`} />
                <CardContent className="p-4 md:p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg md:text-xl font-bold">{signal.symbol}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      signal.type.includes('buy') ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {signal.type.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>

                  {/* Entry / TP / SL Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-blue-400 mb-0.5">Entry</p>
                      <p className="font-mono text-xs md:text-sm font-bold text-blue-400">
                        {signal.entryPrice ? signal.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-green-400 mb-0.5">TP</p>
                      <p className="font-mono text-xs md:text-sm font-bold text-green-400">
                        {signal.takeProfit ? signal.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-red-400 mb-0.5">SL</p>
                      <p className="font-mono text-xs md:text-sm font-bold text-red-400">
                        {signal.stopLoss ? signal.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Score & R:R */}
                  <div className="flex justify-between items-center mb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Score:</span>
                      <span className="font-bold">{signal.score}<span className="text-muted-foreground font-normal">/100</span></span>
                    </div>
                    {signal.riskRewardRatio > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">R:R</span>
                        <span className={`font-bold font-mono px-1.5 py-0.5 rounded ${
                          signal.riskRewardRatio >= 2 ? 'bg-green-500/10 text-green-500' : 
                          signal.riskRewardRatio >= 1 ? 'bg-yellow-500/10 text-yellow-500' : 
                          'bg-red-500/10 text-red-500'
                        }`}>
                          1:{signal.riskRewardRatio}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {signal.reasons && signal.reasons.length > 0 && (
                    <div className="pt-3 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> {analysisMode === 'combined' ? 'Overall Analysis (Combined)' : 'Technical Analysis'}
                      </p>
                      <ul className="text-xs space-y-1.5">
                        {signal.reasons.slice(0, 3).map((reason: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5 text-muted-foreground">
                            <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${signal.type.includes('buy') ? 'bg-green-500/70' : 'bg-red-500/70'}`} />
                            <span className="leading-tight">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>
        ) : signalsError ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
            <p className="font-medium text-amber-700 dark:text-amber-300">Sinyal belum dapat dimuat</p>
            <p className="mt-1 text-sm text-muted-foreground">{signalsError}</p>
            <Button variant="outline" className="mt-4" onClick={() => void fetchData(true)}>
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </Button>
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
