'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ALL_SYMBOLS } from '@/lib/constants';
import { runBacktest, BacktestResult, StrategyType } from '@/lib/backtest/strategies';
import { EquityChart } from '@/components/backtest/equity-chart';
import { Play, TrendingUp, TrendingDown, Percent, Activity, AlertTriangle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy, setStrategy] = useState<StrategyType>('rsi');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  // Strategy params
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [smaFast, setSmaFast] = useState(20);
  const [smaSlow, setSmaSlow] = useState(50);

  const handleRunBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Fetch 1 year of historical data (1D timeframe)
      const safeSymbol = encodeURIComponent(symbol.replace('/', '-'));
      const res = await fetch(`/api/market/${safeSymbol}?chart=true&timeframe=1D`);
      const data = await res.json();

      if (!data.success || !data.data || !data.data.chart) {
        throw new Error('Failed to fetch historical data for backtesting');
      }

      // We need at least 50 candles to run meaningful backtests
      if (data.data.chart.length < 50) {
        throw new Error('Not enough historical data available for this asset.');
      }

      // Run strategy
      const params = {
        rsiPeriod,
        smaFast,
        smaSlow
      };

      const btResult = runBacktest(data.data.chart, strategy, params, 10000);
      setResult(btResult);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during backtesting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Activity className="w-7 h-7 text-primary" />
              Strategy Backtester
            </h1>
            <p className="text-muted-foreground mt-1">Test trading strategies against historical data.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Configuration Panel */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Asset Symbol</label>
                <Select value={symbol} onValueChange={(v: any) => v && setSymbol(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_SYMBOLS.map(s => (
                      <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Strategy</label>
                <Select value={strategy} onValueChange={(v: any) => setStrategy(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rsi">RSI Mean Reversion</SelectItem>
                    <SelectItem value="sma_crossover">SMA Crossover</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy Specific Parameters */}
              <div className="pt-4 border-t border-border/50">
                <h4 className="text-sm font-semibold mb-3">Parameters</h4>
                
                {strategy === 'rsi' && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">RSI Period</label>
                    <Input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(Number(e.target.value))} />
                    <p className="text-[10px] text-muted-foreground mt-1">Buys when RSI crosses above 30, Sells when crossing below 70.</p>
                  </div>
                )}

                {strategy === 'sma_crossover' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Fast SMA</label>
                      <Input type="number" value={smaFast} onChange={(e) => setSmaFast(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Slow SMA</label>
                      <Input type="number" value={smaSlow} onChange={(e) => setSmaSlow(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>

              <Button className="w-full gap-2 mt-4" onClick={handleRunBacktest} disabled={loading}>
                {loading ? <span className="animate-pulse">Running...</span> : <><Play className="w-4 h-4" /> Run Backtest</>}
              </Button>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2 text-sm text-red-500 mt-4">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results Panel */}
          <div className="lg:col-span-3 space-y-6">
            {!result ? (
              <Card className="h-full min-h-[400px] flex items-center justify-center border-dashed">
                <div className="text-center text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Configure and run a backtest to see results.</p>
                </div>
              </Card>
            ) : (
              <>
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Net Return</p>
                      <p className={`text-xl font-bold font-mono ${result.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {result.totalReturn >= 0 ? '+' : ''}{(result.totalReturn * 100).toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="text-xl font-bold font-mono">
                        {(result.winRate * 100).toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Max Drawdown</p>
                      <p className="text-xl font-bold font-mono text-red-500">
                        -{(result.maxDrawdown * 100).toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Total Trades</p>
                      <p className="text-xl font-bold font-mono">
                        {result.trades.filter(t => t.status === 'closed').length}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Equity Curve */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      Equity Curve
                      <Badge variant="outline" className="font-mono ml-auto">
                        Final: ${result.finalCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EquityChart data={result.equityCurve} />
                  </CardContent>
                </Card>

                {/* Trades List */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Trade History</CardTitle>
                    <CardDescription>Listing closed trades generated by the strategy.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border/50">
                            <th className="text-left py-2 px-2 text-muted-foreground font-medium">Entry Date</th>
                            <th className="text-left py-2 px-2 text-muted-foreground font-medium">Exit Date</th>
                            <th className="text-center py-2 px-2 text-muted-foreground font-medium">Type</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Entry Price</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Exit Price</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.trades.filter(t => t.status === 'closed').reverse().map((trade, idx) => (
                            <tr key={idx} className="border-b border-border/20 hover:bg-muted/30">
                              <td className="py-2 px-2">{new Date(trade.entryTime).toLocaleDateString()}</td>
                              <td className="py-2 px-2">{trade.exitTime ? new Date(trade.exitTime).toLocaleDateString() : '-'}</td>
                              <td className="py-2 px-2 text-center">
                                <Badge variant="outline" className={trade.type === 'buy' ? 'text-green-500 border-green-500/30 bg-green-500/10' : 'text-red-500 border-red-500/30 bg-red-500/10'}>
                                  {trade.type.toUpperCase()}
                                </Badge>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                              <td className="py-2 px-2 text-right font-mono">${trade.exitPrice?.toFixed(2) || '-'}</td>
                              <td className={`py-2 px-2 text-right font-mono ${(trade.pnlPercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {((trade.pnlPercent || 0) * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                          {result.trades.filter(t => t.status === 'closed').length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-4 text-muted-foreground">No trades executed</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
