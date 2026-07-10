'use client';

import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/stores/user-store';
import { WatchlistItem } from '@/types/user';
import { MarketType } from '@/types/market';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WatchlistButtonProps {
  symbol: string;
  name?: string;
  marketType: MarketType;
  className?: string;
}

export function WatchlistButton({ symbol, name = symbol, marketType, className }: WatchlistButtonProps) {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useUserStore();
  const isWatched = watchlist.some((item) => item.symbol === symbol);

  const toggleWatchlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isWatched) {
      removeFromWatchlist(symbol);
      toast.success(`${symbol} removed from watchlist`);
    } else {
      const newItem: WatchlistItem = {
        id: crypto.randomUUID(),
        userId: 'local',
        symbol,
        displayName: name,
        notes: null,
        sortOrder: 0,
        marketType,
        createdAt: new Date().toISOString(),
      };
      addToWatchlist(newItem);
      toast.success(`${symbol} added to watchlist`);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full hover:bg-yellow-500/10 transition-colors h-8 w-8 z-10",
        className
      )}
      onClick={toggleWatchlist}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Star
        className={cn(
          "h-4 w-4 transition-all duration-300",
          isWatched ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
        )}
      />
    </Button>
  );
}
