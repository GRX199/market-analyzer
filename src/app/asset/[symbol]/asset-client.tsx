'use client';

import { useEffect, useState, useMemo } from 'react';
import { AssetData, OHLCV, Timeframe, MarketType } from '@/types/market';
import { FinalAnalysis } from '@/types/analysis';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import { PriceTicker } from '@/components/market/price-ticker';
import { SignalCard } from '@/components/market/signal-card';
import { AISummaryWidget } from '@/components/market/ai-summary-widget';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TIMEFRAMES } from '@/lib/constants';
import { Star, ArrowLeft } from 'lucide-react';
import { useUserStore } from '@/stores/user-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function AssetClientPage({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [analysis, setAnalysis] = useState<FinalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null);
  const [maOverlays, setMaOverlays] = useState([
    { period: 20, color: '#f59e0b', visible: true },
    { period: 50, color: '#3b82f6', visible: true },
    { period: 200, color: '#a855f7', visible: true },
  ]);

  const toggleMA = (period: number) => {
    setMaOverlays(prev => prev.map(ma => ma.period === period ? { ...ma, visible: !ma.visible } : ma));
  };
  
  const { watchlist, addToWatchlist, removeFromWatchlist } = useUserStore();
  const isWatched = watchlist.some(w => w.symbol === symbol);

  const isEligibleForRealtime = asset?.marketType === 'crypto';
  const binanceSymbol = isEligibleForRealtime ? symbol.replace('/', '').toUpperCase() : '';
  const priceData = useRealtimeStore((state) => 
    isEligibleForRealtime ? state.prices[binanceSymbol] : undefined
  );

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [marketRes, analysisRes] = await Promise.all([
          fetch(`/api/market/${encodeURIComponent(symbol)}?chart=true&timeframe=${timeframe}`),
          fetch(`/api/analysis/${encodeURIComponent(symbol)}?timeframe=${timeframe}`)
        ]);

        const marketResult = await marketRes.json();
        const analysisResult = await analysisRes.json();

        if (marketResult.success && marketResult.data) {
          setAsset(marketResult.data.asset);
          if (marketResult.data.chart) {
            setCandles(marketResult.data.chart);
          }
        }

        if (analysisResult.success && analysisResult.data) {
          setAnalysis(analysisResult.data);
        }
      } catch (error) {
        console.error('Failed to load asset data', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [symbol, timeframe]);

  const getMarketStateDetails = (state: string | undefined, marketType: string | undefined) => {
    // Crypto is always open 24/7
    if (marketType === 'crypto' || state === 'REGULAR') {
      return { label: 'OPEN', color: 'bg-green-500/10 text-green-500 border-green-500/20' };
    }
    if (state === 'CLOSED') {
      return { label: 'CLOSED', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
    }
    if (state === 'PRE') {
      return { label: 'PRE-MARKET', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
    }
    if (state === 'POST' || state === 'POSTPOST') {
      return { label: 'POST-MARKET', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
    }
    // Default fallback
    return { label: state || 'OPEN', color: 'bg-green-500/10 text-green-500 border-green-500/20' };
  };

  const handleWatchlist = () => {
    if (!asset) return;
    if (isWatched) {
      removeFromWatchlist(asset.symbol);
    } else {
      addToWatchlist({
        id: crypto.randomUUID(),
        userId: 'demo',
        symbol: asset.symbol,
        marketType: asset.marketType,
        displayName: asset.name,
        notes: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
      });
    }
  };

  if (loading || !asset || !analysis) {
    return <div className="p-8 text-center animate-pulse">Loading Analysis Engine...</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link href="/market" className="text-muted-foreground hover:text-foreground flex items-center gap-2 mb-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to Market
          </Link>
          <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">{asset.symbol}</h1>
            <span className="text-muted-foreground text-base md:text-lg">{asset.name}</span>
            <Badge variant="outline" className={`uppercase text-[10px] tracking-wider px-2 py-0.5 ${getMarketStateDetails(asset.marketState, asset.marketType).color}`}>
              {getMarketStateDetails(asset.marketState, asset.marketType).label}
            </Badge>
            <Button variant="outline" size="icon" onClick={handleWatchlist} className="ml-2">
              <Star className={`h-4 w-4 ${isWatched ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="w-full md:w-auto flex justify-start md:justify-end">
          <PriceTicker 
            price={crosshairPrice || asset.price} 
            change={asset.change} 
            changePercent={asset.changePercent} 
            size="lg" 
            symbol={asset.symbol}
            marketType={asset.marketType}
            isHoveringChart={!!crosshairPrice}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-3 md:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="font-semibold">Interactive Chart</h3>
              <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                <TabsList className="h-8">
                  {TIMEFRAMES.map(tf => (
                    <TabsTrigger key={tf.value} value={tf.value} className="text-xs px-2 h-6">
                      {tf.value}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <CandlestickChart 
              data={candles} 
              height={typeof window !== 'undefined' && window.innerWidth < 640 ? 320 : 500} 
              onCrosshairMove={setCrosshairPrice}
              maOverlays={maOverlays}
              realtimePrice={priceData?.current}
            />
            {/* MA Legend / Toggle */}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground mr-1">Overlays:</span>
              {maOverlays.map(ma => (
                <button
                  key={ma.period}
                  onClick={() => toggleMA(ma.period)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
                    ma.visible 
                      ? 'border-transparent bg-white/10 shadow-sm' 
                      : 'border-border/50 opacity-40 hover:opacity-70'
                  }`}
                >
                  <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: ma.color }} />
                  SMA {ma.period}
                </button>
              ))}
            </div>
          </div>

          {/* Indicators Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <div className="bg-card p-4 rounded-xl border flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Technical Score</span>
              <p className="text-xl font-mono font-bold text-primary">{analysis.technical.score}/100</p>
              <Badge variant="outline" className="w-fit mt-1 border-primary/30 text-primary">Scanner Match</Badge>
            </div>
            <div className="bg-card p-4 rounded-xl border flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">RSI (14)</span>
              <p className="text-xl font-mono font-bold">{(analysis.technical.rsi?.value || 0).toFixed(1)}</p>
              <Badge variant="outline" className="w-fit mt-1">{analysis.technical.rsi?.signal || 'neutral'}</Badge>
            </div>
            <div className="bg-card p-4 rounded-xl border flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">MACD</span>
              <p className="text-xl font-mono font-bold">{(analysis.technical.macd?.histogram || 0).toFixed(4)}</p>
              <Badge variant="outline" className="w-fit mt-1">{analysis.technical.macd?.signal || 'neutral'}</Badge>
            </div>
            <div className="bg-card p-4 rounded-xl border flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">ATR / Volat.</span>
              <p className="text-xl font-mono font-bold">{(analysis.technical.atr?.percentOfPrice || 0).toFixed(2)}%</p>
              <Badge variant="outline" className="w-fit mt-1">{analysis.technical.atr?.volatility || 'medium'}</Badge>
            </div>
            <div className="bg-card p-4 rounded-xl border flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Stoch RSI</span>
              <p className="text-xl font-mono font-bold">{(analysis.technical.stochRSI?.k || 0).toFixed(1)}</p>
              <Badge variant="outline" className="w-fit mt-1">{analysis.technical.stochRSI?.signal || 'neutral'}</Badge>
            </div>
          </div>
        </div>

        {/* Analysis Sidebar Column */}
        <div className="space-y-6">
          <AISummaryWidget symbol={asset.symbol} analysis={analysis} />
          
          <SignalCard 
            score={analysis.finalScore}
            signal={analysis.signal}
            confidence={analysis.confidence}
            riskLevel={analysis.riskLevel}
            trend={analysis.trend}
            reasons={analysis.reasons}
            buyFactors={analysis.buyFactors}
            sellFactors={analysis.sellFactors}
            riskFactors={analysis.riskFactors}
            supportLevel={analysis.supportLevel}
            resistanceLevel={analysis.resistanceLevel}
            stopLoss={analysis.stopLoss}
            takeProfit={analysis.takeProfit}
            symbol={asset.symbol}
            name={asset.name}
            marketType={asset.marketType}
          />
        </div>
      </div>
    </div>
  );
}
