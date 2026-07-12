'use client';

import { PortfolioPosition } from '@/types/portfolio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Lock, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

interface PositionTableProps {
  positions: PortfolioPosition[];
  onClose: (id: string, currentPrice: number) => void;
  onRemove: (id: string) => void;
}

export function PositionTable({ positions, onClose, onRemove }: PositionTableProps) {
  if (positions.length === 0) {
    return null;
  }

  const calcPnl = (pos: PortfolioPosition) => {
    const price = pos.isOpen ? pos.currentPrice : (pos.closedPrice || pos.currentPrice);
    if (pos.type === 'buy') {
      return (price - pos.entryPrice) * pos.quantity;
    }
    return (pos.entryPrice - price) * pos.quantity;
  };

  const calcPnlPercent = (pos: PortfolioPosition) => {
    const pnl = calcPnl(pos);
    const invested = pos.entryPrice * pos.quantity;
    return invested > 0 ? (pnl / invested) * 100 : 0;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-3 px-2 text-muted-foreground font-medium">Asset</th>
            <th className="text-center py-3 px-2 text-muted-foreground font-medium">Type</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">Qty</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">Entry</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">Current</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">P&L ($)</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">P&L (%)</th>
            <th className="text-center py-3 px-2 text-muted-foreground font-medium">Status</th>
            <th className="text-right py-3 px-2 text-muted-foreground font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            const pnl = calcPnl(pos);
            const pnlPercent = calcPnlPercent(pos);
            const isProfit = pnl >= 0;

            return (
              <tr key={pos.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-2">
                  <Link href={`/asset/${encodeURIComponent(pos.symbol.replace('/', '-'))}`} className="hover:underline">
                    <div>
                      <span className="font-semibold">{pos.symbol}</span>
                      <p className="text-xs text-muted-foreground">{pos.name}</p>
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-2 text-center">
                  <Badge 
                    variant="outline" 
                    className={pos.type === 'buy' 
                      ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                      : 'bg-red-500/10 text-red-500 border-red-500/20'
                    }
                  >
                    {pos.type === 'buy' ? 'LONG' : 'SHORT'}
                  </Badge>
                </td>
                <td className="py-3 px-2 text-right font-mono">{pos.quantity}</td>
                <td className="py-3 px-2 text-right font-mono">${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                <td className="py-3 px-2 text-right font-mono">
                  {pos.isOpen 
                    ? `$${pos.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` 
                    : `$${(pos.closedPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  }
                </td>
                <td className={`py-3 px-2 text-right font-mono font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                  <span className="inline-flex items-center gap-1">
                    {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isProfit ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </td>
                <td className={`py-3 px-2 text-right font-mono font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                  {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
                </td>
                <td className="py-3 px-2 text-center">
                  {pos.isOpen ? (
                    <Badge className="bg-blue-500/15 text-blue-500 border-none">Open</Badge>
                  ) : (
                    <Badge variant="secondary">Closed</Badge>
                  )}
                </td>
                <td className="py-3 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {pos.isOpen && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                        onClick={() => onClose(pos.id, pos.currentPrice)}
                        title="Close position"
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => onRemove(pos.id)}
                      title="Remove position"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
