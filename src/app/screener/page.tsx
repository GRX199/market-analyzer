'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ScanSearch, ArrowUpDown, ExternalLink } from 'lucide-react';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '@/lib/constants';
import Link from 'next/link';
import { SignalType } from '@/types/analysis';

export default function ScreenerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterMarket, setFilterMarket] = useState('all');
  const [filterSignal, setFilterSignal] = useState('all');
  const [sortBy, setSortBy] = useState('score_desc');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [signalsRes, marketRes] = await Promise.all([
          fetch('/api/signals?timeframe=1D'),
          fetch('/api/market')
        ]);
        const signals = await signalsRes.json();
        const markets = await marketRes.json();
        
        if (signals.success && markets.success && Array.isArray(signals.data) && Array.isArray(markets.data)) {
          // Merge data
          const merged = signals.data.map((sig: any) => {
            const mkt = markets.data.find((m: any) => m.symbol === sig.symbol);
            return {
              ...sig,
              price: mkt?.price || 0,
              changePercent: mkt?.changePercent || 0,
              volume: mkt?.volume || 0
            };
          });
          setData(merged);
        } else {
          throw new Error(signals.error || markets.error || 'Respons screener tidak valid.');
        }
      } catch (err) {
        console.error('Failed to load screener data', err);
        setError(err instanceof Error ? err.message : 'Screener gagal dimuat.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredData = data.filter(item => {
    if (search && !item.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMarket !== 'all' && item.marketType !== filterMarket) return false;
    if (filterSignal !== 'all' && item.signal !== filterSignal) return false;
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'score_desc': return b.finalScore - a.finalScore;
      case 'score_asc': return a.finalScore - b.finalScore;
      case 'rsi_desc': return (b.technical?.rsi?.value || 0) - (a.technical?.rsi?.value || 0);
      case 'rsi_asc': return (a.technical?.rsi?.value || 0) - (b.technical?.rsi?.value || 0);
      case 'change_desc': return b.changePercent - a.changePercent;
      case 'change_asc': return a.changePercent - b.changePercent;
      default: return 0;
    }
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <ScanSearch className="w-7 h-7 text-primary" />
            Advanced Screener
          </h1>
          <p className="text-muted-foreground mt-1">Filter dan urutkan aset berdasarkan indikator teknikal dan skor analisis.</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="relative w-full md:w-64">
              <Input 
                placeholder="Search symbol..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="flex w-full md:w-auto gap-4 flex-wrap md:flex-nowrap">
              <Select value={filterMarket} onValueChange={(v: any) => v && setFilterMarket(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="stocks">Stocks</SelectItem>
                  <SelectItem value="forex">Forex</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterSignal} onValueChange={(v: any) => v && setFilterSignal(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Signal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Signals</SelectItem>
                  <SelectItem value="strong_buy">Strong Buy</SelectItem>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                  <SelectItem value="strong_sell">Strong Sell</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v: any) => v && setSortBy(v)}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4" />
                    <SelectValue placeholder="Sort by" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score_desc">Skor Analisis (Tinggi-Rendah)</SelectItem>
                  <SelectItem value="score_asc">Skor Analisis (Rendah-Tinggi)</SelectItem>
                  <SelectItem value="rsi_desc">RSI (High-Low)</SelectItem>
                  <SelectItem value="rsi_asc">RSI (Low-High)</SelectItem>
                  <SelectItem value="change_desc">24h Change (High-Low)</SelectItem>
                  <SelectItem value="change_asc">24h Change (Low-High)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Screener belum dapat dimuat</p>
              <p className="mt-1 text-red-500/80">{error}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Asset</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Price & 24h</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Sinyal Analisis</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Score</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">RSI (14)</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">MACD</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Trend</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12">
                        <ScanSearch className="w-8 h-8 mx-auto animate-pulse text-muted-foreground mb-4" />
                        <p className="text-muted-foreground animate-pulse">Scanning markets...</p>
                      </td>
                    </tr>
                  ) : filteredData.length > 0 ? (
                    filteredData.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold">{item.symbol}</div>
                          <Badge variant="outline" className="text-[10px] mt-1">{item.marketType}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono">${(item.price || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                          <div className={`text-xs font-semibold ${item.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {item.changePercent >= 0 ? '+' : ''}{(item.changePercent || 0).toFixed(2)}%
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge style={{ 
                            backgroundColor: SIGNAL_COLORS[item.signal as SignalType] + '20',
                            color: SIGNAL_COLORS[item.signal as SignalType],
                            borderColor: SIGNAL_COLORS[item.signal as SignalType] + '40'
                          }} variant="outline">
                            {SIGNAL_LABELS[item.signal as SignalType]}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="font-mono font-bold text-lg">{item.finalScore}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className={`font-mono ${item.technical?.rsi?.value > 70 ? 'text-red-500' : item.technical?.rsi?.value < 30 ? 'text-green-500' : ''}`}>
                            {item.technical?.rsi?.value?.toFixed(1) || '-'}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">{item.technical?.rsi?.signal || '-'}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono">{item.technical?.macd?.histogram?.toFixed(3) || '-'}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{item.technical?.macd?.signal || '-'}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="outline" className={
                            item.trend === 'bullish' ? 'text-green-500 border-green-500/20 bg-green-500/10' :
                            item.trend === 'bearish' ? 'text-red-500 border-red-500/20 bg-red-500/10' :
                            'text-yellow-500 border-yellow-500/20 bg-yellow-500/10'
                          }>
                            {item.trend}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Link href={`/asset/${encodeURIComponent(item.symbol.replace('/', '-'))}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-muted-foreground">
                        No assets found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
