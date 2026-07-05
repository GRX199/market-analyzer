'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { DashboardSkeleton } from '@/components/common/loading-skeleton';
import { Activity, Radio, TrendingUp, TrendingDown, Target, Zap, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMarketStore } from '@/stores/market-store';
import { TIMEFRAMES } from '@/lib/constants';
import Link from 'next/link';

export default function SignalScannerPage() {
  const { selectedMarket, selectedTimeframe, setSelectedTimeframe, analysisMode, setAnalysisMode } = useMarketStore();
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function scanMarkets() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (selectedMarket && selectedMarket !== 'all') query.append('market', selectedMarket);
        if (selectedTimeframe) query.append('timeframe', selectedTimeframe);
        if (analysisMode) query.append('mode', analysisMode);

        const res = await fetch(`/api/signals?${query.toString()}`);
        const result = await res.json();
        
        if (result.success && result.data) {
          setSignals(result.data);
        } else {
          setError(result.error || 'Failed to scan markets');
        }
      } catch (err) {
        console.error('Scanner error:', err);
        setError('Connection error. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    scanMarkets();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(scanMarkets, 60000);
    return () => clearInterval(interval);
  }, [selectedMarket, selectedTimeframe, analysisMode]);

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Radio className="w-8 h-8 text-primary animate-pulse" /> 
            Live Market Scanner
          </h1>
          <p className="text-muted-foreground mt-2">
            Our AI continuously scans {selectedMarket || 'all'} markets on the <strong>{selectedTimeframe}</strong> timeframe to find high-probability entry opportunities based on technical confluence.
          </p>
          
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border w-fit">
              <span className="text-sm text-muted-foreground ml-2 font-medium">Mode:</span>
              <Select value={analysisMode} onValueChange={(v) => setAnalysisMode(v as any)}>
                <SelectTrigger className="h-8 border-0 bg-transparent shadow-none text-xs w-[140px]">
                  <SelectValue placeholder="Analysis Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">Combined (Overall)</SelectItem>
                  <SelectItem value="technical">Technical Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border w-fit">
              <span className="text-sm text-muted-foreground ml-2 font-medium">Timeframe:</span>
              <Tabs value={selectedTimeframe} onValueChange={(v) => setSelectedTimeframe(v as any)}>
                <TabsList className="h-8 bg-transparent">
                  {TIMEFRAMES.map(tf => (
                    <TabsTrigger key={tf.value} value={tf.value} className="text-xs px-3 h-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      {tf.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card px-4 py-2 rounded-full border shadow-sm self-start sm:self-auto mt-4 sm:mt-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Scanner Active
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl mb-6 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DashboardSkeleton />
          <DashboardSkeleton />
        </div>
      ) : signals.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {signals.map((signal) => (
            <Link href={`/asset/${encodeURIComponent(signal.symbol)}`} key={signal.id} className="block group h-full">
              <Card className="overflow-hidden border border-border/50 group-hover:border-primary/50 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/5 h-full bg-card/50 backdrop-blur-sm relative">
                {/* Strength Indicator Bar */}
                <div className="absolute top-0 left-0 w-full h-1 bg-muted">
                  <div 
                    className={`h-full transition-all duration-1000 ${
                      signal.type.includes('buy') ? 'bg-gradient-to-r from-green-500/50 to-green-500' : 'bg-gradient-to-r from-red-500/50 to-red-500'
                    }`} 
                    style={{ width: `${signal.score}%` }} 
                  />
                </div>
                
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{signal.symbol}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Target className="w-3 h-3" /> Entry Price: <span className="font-mono text-foreground">${signal.priceAtSignal.toLocaleString()}</span>
                      </p>
                    </div>
                    <Badge className={`px-3 py-1 text-sm font-bold shadow-sm ${
                      signal.type === 'strong_buy' ? 'bg-green-500 hover:bg-green-600 text-white border-none' :
                      signal.type === 'buy' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30 border-green-500/30' :
                      signal.type === 'strong_sell' ? 'bg-red-500 hover:bg-red-600 text-white border-none' :
                      'bg-red-500/20 text-red-500 hover:bg-red-500/30 border-red-500/30'
                    }`}>
                      {signal.type.toUpperCase().replace('_', ' ')}
                    </Badge>
                  </div>
                  
                  {/* Score Dial */}
                  <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-background/50 border border-border/50">
                    <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-card shadow-inner shrink-0 border border-border/50">
                      <span className={`text-xl font-black ${
                        signal.type.includes('buy') ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {signal.score}
                      </span>
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
                        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" 
                          strokeDasharray="175.93" strokeDashoffset={175.93 - (175.93 * signal.score) / 100}
                          className={`transition-all duration-1000 ${signal.type.includes('buy') ? 'text-green-500' : 'text-red-500'}`} 
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Signal Strength</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Based on algorithmic confluence of moving averages, oscillators, and trend alignment.
                      </p>
                    </div>
                  </div>
                  
                  {/* Reasons List */}
                  {signal.reasons && signal.reasons.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-yellow-500" /> Catalyst Factors
                      </p>
                      <ul className="space-y-2.5">
                        {signal.reasons.map((reason: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                              signal.type.includes('buy') ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {signal.type.includes('buy') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            </span>
                            <span className="text-sm leading-relaxed text-foreground/90">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-2xl p-12 border border-border text-center flex flex-col items-center max-w-2xl mx-auto shadow-sm">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-bold mb-2">No Active Signals</h3>
          <p className="text-muted-foreground text-lg mb-6">
            The scanner didn&apos;t find any high-probability entry opportunities meeting our strict confluence criteria at this moment.
          </p>
          <div className="px-6 py-3 rounded-xl bg-background border text-sm font-medium">
            Waiting for next market movement...
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
