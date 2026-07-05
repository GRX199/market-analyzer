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

  const formatPrice = (p: number) => {
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
        <span className={cn('font-mono font-semibold', sizeClasses[size].change, isPositive ? 'text-green-500' : 'text-red-500')}>
          {isPositive ? '+' : ''}{change.toFixed(Math.abs(change) < 1 ? 4 : 2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
