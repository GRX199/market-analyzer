'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ALL_SYMBOLS } from '@/lib/constants';
import { Columns3, LayoutGrid, Square, Columns } from 'lucide-react';
import { CandlestickChart } from '@/components/charts/candlestick-chart';
import { OHLCV } from '@/types/market';
import { useEffect, useState as useReactState } from 'react';

// Wrapper component to fetch data and render chart for the compare grid
function CompareChartWrapper({ symbol }: { symbol: string }) {
  const [data, setData] = useReactState<OHLCV[]>([]);
  const [loading, setLoading] = useReactState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const safeSymbol = encodeURIComponent(symbol.replace('/', '-'));
        const res = await fetch(`/api/market/${safeSymbol}?chart=true&timeframe=1D`);
        const result = await res.json();
        if (result.success && result.data?.chart) {
          setData(result.data.chart);
        }
      } catch (err) {
        console.error('Failed to load chart for', symbol);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [symbol]);

  if (loading) {
    return <div className="absolute inset-0 flex items-center justify-center text-muted-foreground animate-pulse text-sm">Loading chart...</div>;
  }

  return <CandlestickChart data={data} height={typeof window !== 'undefined' ? window.innerHeight / 2 - 100 : 300} />;
}

type LayoutType = '1x1' | '2x1' | '2x2';

export default function MultiChartPage() {
  const [layout, setLayout] = useState<LayoutType>('2x2');
  
  const [symbols, setSymbols] = useState<string[]>([
    'BTC/USDT',
    'ETH/USDT',
    'EUR/USD',
    'AAPL'
  ]);

  const updateSymbol = (index: number, newSymbol: string) => {
    const newSymbols = [...symbols];
    newSymbols[index] = newSymbol;
    setSymbols(newSymbols);
  };

  const getGridClass = () => {
    switch (layout) {
      case '1x1': return 'grid-cols-1';
      case '2x1': return 'grid-cols-1 md:grid-cols-2';
      case '2x2': return 'grid-cols-1 md:grid-cols-2';
      default: return 'grid-cols-1';
    }
  };

  const getChartCount = () => {
    switch (layout) {
      case '1x1': return 1;
      case '2x1': return 2;
      case '2x2': return 4;
      default: return 1;
    }
  };

  const count = getChartCount();

  return (
    <DashboardLayout>
      <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Columns3 className="w-6 h-6 text-primary" />
              Multi-Chart Compare
            </h1>
          </div>
          
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/50">
            <Button 
              variant={layout === '1x1' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setLayout('1x1')}
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button 
              variant={layout === '2x1' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setLayout('2x1')}
            >
              <Columns className="w-4 h-4" />
            </Button>
            <Button 
              variant={layout === '2x2' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setLayout('2x2')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className={`grid ${getGridClass()} gap-4 flex-1 min-h-0`}>
          {Array.from({ length: count }).map((_, i) => (
            <Card key={i} className="flex flex-col h-full overflow-hidden border-border/50">
              <div className="p-2 border-b border-border/50 bg-muted/20 shrink-0">
                <Select value={symbols[i]} onValueChange={(v: any) => v && updateSymbol(i, v)}>
                  <SelectTrigger className="h-8 text-xs font-semibold w-[200px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_SYMBOLS.map(s => (
                      <SelectItem key={s.symbol} value={s.symbol} className="text-xs">
                        {s.symbol} <span className="text-muted-foreground ml-2">{s.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <CardContent className="p-0 flex-1 relative bg-black/5">
                <div className="absolute inset-0">
                  <CompareChartWrapper symbol={symbols[i]} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
