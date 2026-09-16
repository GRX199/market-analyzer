'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AssetData } from '@/types/market';
import { cn } from '@/lib/utils';
import { WatchlistButton } from '@/components/common/watchlist-button';
import { RealtimePrice } from '@/components/market/realtime-price';

interface AssetCardProps {
  asset: AssetData;
  showWatchlistButton?: boolean;
}

export function AssetCard({ asset, showWatchlistButton = true }: AssetCardProps) {
  const isPositive = asset.changePercent >= 0;
  const TrendIcon = asset.trend === 'bullish' ? TrendingUp : asset.trend === 'bearish' ? TrendingDown : Minus;

  const getMarketStateDetails = (state: string | undefined, marketType: string) => {
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

  const marketStateInfo = getMarketStateDetails(asset.marketState, asset.marketType);

  const formatVolume = (vol: number | null | undefined) => {
    if (vol === null || vol === undefined || vol === 0) return '0';
    if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
    return vol.toString();
  };

  return (
      <Card className="relative h-full transition-colors hover:border-primary/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-base"><Link href={`/asset/${encodeURIComponent(asset.symbol)}`} className="after:absolute after:inset-0 after:rounded-xl">{asset.symbol}</Link></h3>
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 gap-1 text-muted-foreground"
                >
                  <TrendIcon className="h-2.5 w-2.5" />
                  {asset.trend}
                </Badge>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 uppercase tracking-wider ${marketStateInfo.color}`}>
                  {marketStateInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{asset.name}</p>
            </div>
            {showWatchlistButton && (
              <span className="relative z-10"><WatchlistButton
                symbol={asset.symbol} 
                name={asset.name} 
                marketType={asset.marketType} 
              /></span>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <RealtimePrice 
                symbol={asset.symbol} 
                marketType={asset.marketType} 
                initialPrice={asset.price} 
                className="text-lg font-bold font-mono"
              />
              <div className="flex items-center gap-1 mt-0.5">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={cn('text-xs font-mono font-semibold', isPositive ? 'text-green-500' : 'text-red-500')}>
                  {isPositive ? '+' : ''}{(asset.changePercent || 0).toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Vol</p>
              <p className="text-xs font-mono">{formatVolume(asset.volume)}</p>
              {asset.marketCap && (
                <>
                  <p className="text-[10px] text-muted-foreground mt-1">MCap</p>
                  <p className="text-xs font-mono">{formatVolume(asset.marketCap)}</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
  );
}
