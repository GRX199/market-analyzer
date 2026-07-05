'use client';

import { useEffect, useState, useMemo } from 'react';
import { AssetData, OHLCV, Timeframe, MarketType } from '@/types/market';
import { FinalAnalysis } from '@/types/analysis';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import { PriceTicker } from '@/components/market/price-ticker';
import { SignalCard } from '@/components/market/signal-card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TIMEFRAMES } from '@/lib/constants';
import { Star, ArrowLeft } from 'lucide-react';
import { useUserStore } from '@/stores/user-store';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function AssetClientPage({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [analysis, setAnalysis] = useState<FinalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null);
  
  const { watchlist, addToWatchlist, removeFromWatchlist } = useUserStore();
  const isWatched = watchlist.some(w => w.symbol === symbol);

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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{asset.symbol}</h1>
            <span className="text-muted-foreground text-lg">{asset.name}</span>
            {asset.marketState && asset.marketState !== 'REGULAR' && (
              <Badge variant="secondary" className="uppercase text-xs tracking-wider">
                {asset.marketState}
              </Badge>
            )}
            <Button variant="outline" size="icon" onClick={handleWatchlist} className="ml-2">
              <Star className={`h-4 w-4 ${isWatched ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="text-right">
          <PriceTicker 
            price={crosshairPrice || asset.price} 
            change={asset.change} 
            changePercent={asset.changePercent} 
            size="lg" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4">
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
              height={500} 
              onCrosshairMove={setCrosshairPrice}
            />
          </div>

          {/* Indicators Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
          />
        </div>
      </div>
    </div>
  );
}
