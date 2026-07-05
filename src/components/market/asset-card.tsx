'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react';
import { AssetData } from '@/types/market';
import { cn } from '@/lib/utils';
import { TREND_COLORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/stores/user-store';

interface AssetCardProps {
  asset: AssetData;
  showWatchlistButton?: boolean;
}

export function AssetCard({ asset, showWatchlistButton = true }: AssetCardProps) {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useUserStore();
  const isWatched = watchlist.some(w => w.symbol === asset.symbol);
  const isPositive = asset.changePercent >= 0;
  const TrendIcon = asset.trend === 'bullish' ? TrendingUp : asset.trend === 'bearish' ? TrendingDown : Minus;

  const handleWatchlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '0.00';
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price > 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatVolume = (vol: number | null | undefined) => {
    if (vol === null || vol === undefined || vol === 0) return '0';
    if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
    return vol.toString();
  };

  return (
    <Link href={`/asset/${encodeURIComponent(asset.symbol)}`}>
      <Card className="group hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">{asset.symbol}</h3>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 gap-0.5"
                  style={{ color: TREND_COLORS[asset.trend], borderColor: TREND_COLORS[asset.trend] + '40' }}
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleWatchlist}>
                <Star className={cn('h-3.5 w-3.5', isWatched && 'fill-yellow-400 text-yellow-400')} />
              </Button>
            )}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-bold font-mono">{formatPrice(asset.price)}</p>
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
    </Link>
  );
}
