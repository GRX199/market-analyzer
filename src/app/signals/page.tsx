'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { EmptyState } from '@/components/common/empty-state';
import { History, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '@/lib/constants';
import { SignalType } from '@/types/analysis';

// Mock history data for demonstration
const mockHistory = [
  { id: '1', symbol: 'BTC/USDT', type: 'strong_buy' as SignalType, priceAtSignal: 62000, currentPrice: 64500, date: new Date(Date.now() - 86400000).toISOString(), score: 85, status: 'profit' },
  { id: '2', symbol: 'EUR/USD', type: 'sell' as SignalType, priceAtSignal: 1.0950, currentPrice: 1.0910, date: new Date(Date.now() - 172800000).toISOString(), score: 35, status: 'profit' },
  { id: '3', symbol: 'AAPL', type: 'buy' as SignalType, priceAtSignal: 175.50, currentPrice: 174.20, date: new Date(Date.now() - 259200000).toISOString(), score: 72, status: 'loss' },
  { id: '4', symbol: 'ETH/USDT', type: 'hold' as SignalType, priceAtSignal: 3100, currentPrice: 3150, date: new Date().toISOString(), score: 55, status: 'pending' },
];

export default function SignalHistoryPage() {
  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Signal History</h1>
          <p className="text-muted-foreground">Track past AI signals and evaluate their performance.</p>
        </div>
      </div>

      <div className="space-y-4">
        {mockHistory.map(item => (
          <Card key={item.id} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: SIGNAL_COLORS[item.type] }} />
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{item.symbol}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.date).toLocaleDateString()} at {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 flex-1 justify-between sm:justify-end w-full sm:w-auto">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Signal</p>
                  <Badge style={{ backgroundColor: SIGNAL_COLORS[item.type] + '20', color: SIGNAL_COLORS[item.type] }}>
                    {SIGNAL_LABELS[item.type]}
                  </Badge>
                </div>

                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Price at Signal</p>
                  <p className="font-mono text-sm">{item.priceAtSignal}</p>
                </div>
                
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Current Price</p>
                  <p className="font-mono text-sm">{item.currentPrice}</p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Status</p>
                  <Badge variant="outline" className={
                    item.status === 'profit' ? 'text-green-500 border-green-500/50' : 
                    item.status === 'loss' ? 'text-red-500 border-red-500/50' : 'text-yellow-500 border-yellow-500/50'
                  }>
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
