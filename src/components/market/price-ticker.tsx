import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PriceTickerProps {
  price: number;
  change: number;
  changePercent: number;
  size?: 'sm' | 'md' | 'lg';
}

export function PriceTicker({ price, change, changePercent, size = 'md' }: PriceTickerProps) {
  const isPositive = changePercent >= 0;

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return '0.00';
    if (p > 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p > 1) return p.toFixed(4);
    return p.toFixed(6);
  };

  const sizeClasses = {
    sm: { price: 'text-lg', change: 'text-xs' },
    md: { price: 'text-2xl', change: 'text-sm' },
    lg: { price: 'text-4xl', change: 'text-base' },
  };

  return (
    <div>
      <p className={cn('font-bold font-mono', sizeClasses[size].price)}>
        {formatPrice(price)}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500" />
        )}
        <span className={cn('text-sm font-semibold flex items-center', isPositive ? 'text-green-500' : 'text-red-500')}>
          {isPositive ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
          {isPositive ? '+' : ''}{(change || 0).toFixed(Math.abs(change || 0) < 1 ? 4 : 2)} 
          ({isPositive ? '+' : ''}{(changePercent || 0).toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
