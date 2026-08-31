'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, Play } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { EquityChart } from '@/components/backtest/equity-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_SYMBOLS } from '@/lib/constants';
import {
  BacktestResult,
  runBacktest,
  StrategyType,
} from '@/lib/backtest/strategies';
import { OHLCV } from '@/types/market';

interface MarketChartResponse {
  success: boolean;
  error?: string;
  data?: {
    chart?: OHLCV[];
  };
}

function isMarketChartResponse(value: unknown): value is MarketChartResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Record<string, unknown>;
  return typeof response.success === 'boolean';
}

function isStrategyType(value: string): value is StrategyType {
  return value === 'rsi' || value === 'sma_crossover' || value === 'macd_crossover';
}

function numberFromInput(value: string): number {
  return value === '' ? 0 : Number(value);
}

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy, setStrategy] = useState<StrategyType>('rsi');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [smaFast, setSmaFast] = useState(20);
  const [smaSlow, setSmaSlow] = useState(50);
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);

  const [initialCapital, setInitialCapital] = useState(10_000);
  const [positionSize, setPositionSize] = useState(20);
  const [feePercent, setFeePercent] = useState(0.1);
  const [slippagePercent, setSlippagePercent] = useState(0.05);
  const [stopLossPercent, setStopLossPercent] = useState(2);
  const [takeProfitPercent, setTakeProfitPercent] = useState(3);

  const handleRunBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const safeSymbol = encodeURIComponent(symbol.replace('/', '-'));
      const response = await fetch(`/api/market/${safeSymbol}?chart=true&timeframe=1D`);
      const payload: unknown = await response.json();

      if (!isMarketChartResponse(payload)) {
        throw new Error('Server returned an invalid market-data response.');
      }
      if (!response.ok || !payload.success || !Array.isArray(payload.data?.chart)) {
        throw new Error(payload.error || 'Failed to fetch historical market data.');
      }

      const minimumCandles = Math.max(
        60,
        strategy === 'sma_crossover' ? smaSlow + 3 : 0,
        strategy === 'macd_crossover' ? macdSlow + macdSignal + 3 : 0,
        strategy === 'rsi' ? rsiPeriod + 3 : 0,
      );
      if (payload.data.chart.length < minimumCandles) {
        throw new Error(`At least ${minimumCandles} historical candles are required for these parameters.`);
      }

      const marketType = ALL_SYMBOLS.find((item) => item.symbol === symbol)?.marketType;
      const backtest = runBacktest(
        payload.data.chart,
        strategy,
        {
          rsiPeriod,
          rsiOversold,
          rsiOverbought,
          smaFast,
          smaSlow,
          macdFast,
          macdSlow,
          macdSignal,
        },
        {
          initialCapital,
          positionSizePct: positionSize / 100,
          feePct: feePercent / 100,
          slippagePct: slippagePercent / 100,
          stopLossPct: stopLossPercent / 100,
          takeProfitPct: takeProfitPercent / 100,
          periodsPerYear: marketType === 'crypto' ? 365 : 252,
        },
      );
      setResult(backtest);
    } catch (caughtError: unknown) {
      console.error('Backtest failed:', caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'An unexpected error occurred during backtesting.',
      );
    } finally {
      setLoading(false);
    }
  };

  const closedTrades = result?.trades.filter((trade) => trade.status === 'closed') ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
            <Activity className="h-7 w-7 text-primary" />
            Strategy Backtester
          </h1>
          <p className="mt-1 text-muted-foreground">
            Simulate next-candle execution with trading costs and risk limits.
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          Historical results do not guarantee future profit. This simulator uses daily OHLC data,
          conservative stop ordering, fees, and slippage, but it still cannot reproduce liquidity,
          spread changes, or live execution exactly.
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <Card className="h-fit lg:col-span-1">
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Percentages are applied per trade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="backtest-symbol">Asset Symbol</label>
                <Select
                  value={symbol}
                  onValueChange={(value: string | null) => {
                    if (value) setSymbol(value);
                  }}
                >
                  <SelectTrigger id="backtest-symbol">
                    <SelectValue placeholder="Select asset" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_SYMBOLS.map((item) => (
                      <SelectItem key={item.symbol} value={item.symbol}>
                        {item.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="backtest-strategy">Strategy</label>
                <Select
                  value={strategy}
                  onValueChange={(value: string | null) => {
                    if (value && isStrategyType(value)) setStrategy(value);
                  }}
                >
                  <SelectTrigger id="backtest-strategy">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rsi">RSI Mean Reversion</SelectItem>
                    <SelectItem value="sma_crossover">SMA Crossover</SelectItem>
                    <SelectItem value="macd_crossover">MACD Crossover</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-border/50 pt-4">
                <h2 className="mb-3 text-sm font-semibold">Strategy parameters</h2>

                {strategy === 'rsi' && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="RSI period" value={rsiPeriod} min={2} onChange={setRsiPeriod} />
                    <div />
                    <NumberField label="Oversold" value={rsiOversold} min={1} max={98} onChange={setRsiOversold} />
                    <NumberField label="Overbought" value={rsiOverbought} min={2} max={99} onChange={setRsiOverbought} />
                  </div>
                )}

                {strategy === 'sma_crossover' && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Fast SMA" value={smaFast} min={2} onChange={setSmaFast} />
                    <NumberField label="Slow SMA" value={smaSlow} min={3} onChange={setSmaSlow} />
                  </div>
                )}

                {strategy === 'macd_crossover' && (
                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Fast" value={macdFast} min={2} onChange={setMacdFast} />
                    <NumberField label="Slow" value={macdSlow} min={3} onChange={setMacdSlow} />
                    <NumberField label="Signal" value={macdSignal} min={2} onChange={setMacdSignal} />
                  </div>
                )}
              </div>

              <div className="border-t border-border/50 pt-4">
                <h2 className="mb-3 text-sm font-semibold">Execution & risk</h2>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Initial capital"
                    value={initialCapital}
                    min={1}
                    step={100}
                    onChange={setInitialCapital}
                  />
                  <NumberField
                    label="Position size %"
                    value={positionSize}
                    min={0.01}
                    max={100}
                    step={1}
                    onChange={setPositionSize}
                  />
                  <NumberField
                    label="Fee / side %"
                    value={feePercent}
                    min={0}
                    max={99}
                    step={0.01}
                    onChange={setFeePercent}
                  />
                  <NumberField
                    label="Slippage %"
                    value={slippagePercent}
                    min={0}
                    max={99}
                    step={0.01}
                    onChange={setSlippagePercent}
                  />
                  <NumberField
                    label="Stop loss %"
                    value={stopLossPercent}
                    min={0}
                    max={99}
                    step={0.1}
                    onChange={setStopLossPercent}
                  />
                  <NumberField
                    label="Take profit %"
                    value={takeProfitPercent}
                    min={0}
                    max={99}
                    step={0.1}
                    onChange={setTakeProfitPercent}
                  />
                </div>
              </div>

              <Button className="mt-4 w-full gap-2" onClick={handleRunBacktest} disabled={loading}>
                {loading ? (
                  <span className="animate-pulse">Running…</span>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Backtest
                  </>
                )}
              </Button>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-3">
            {!result ? (
              <Card className="flex min-h-[400px] items-center justify-center border-dashed">
                <div className="text-center text-muted-foreground">
                  <Activity className="mx-auto mb-3 h-12 w-12 opacity-20" />
                  <p>Configure and run a backtest to see results.</p>
                </div>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <MetricCard
                    label="Net Return"
                    value={`${result.totalReturn >= 0 ? '+' : ''}${(result.totalReturn * 100).toFixed(2)}%`}
                    tone={result.totalReturn >= 0 ? 'positive' : 'negative'}
                  />
                  <MetricCard label="Win Rate" value={`${(result.winRate * 100).toFixed(1)}%`} />
                  <MetricCard
                    label="Max Drawdown"
                    value={`-${(result.maxDrawdown * 100).toFixed(2)}%`}
                    tone="negative"
                  />
                  <MetricCard label="Total Trades" value={closedTrades.length.toString()} />
                  <MetricCard
                    label="Profit Factor"
                    value={Number.isFinite(result.profitFactor) ? result.profitFactor.toFixed(2) : '∞'}
                  />
                  <MetricCard label="Sharpe (annualized)" value={result.sharpeRatio.toFixed(2)} />
                  <MetricCard
                    label="Avg. P&L / trade"
                    value={`$${result.expectancy.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    tone={result.expectancy >= 0 ? 'positive' : 'negative'}
                  />
                  <MetricCard
                    label="Total Fees"
                    value={`$${result.totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  />
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      Equity Curve
                      <Badge variant="outline" className="ml-auto font-mono">
                        Final: ${result.finalCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EquityChart data={result.equityCurve} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Trade History</CardTitle>
                    <CardDescription>
                      Net P&amp;L includes entry and exit fees; prices include configured slippage.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[320px] overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border/50">
                            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Entry</th>
                            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Exit</th>
                            <th className="px-2 py-2 text-center font-medium text-muted-foreground">Side</th>
                            <th className="px-2 py-2 text-right font-medium text-muted-foreground">Entry Price</th>
                            <th className="px-2 py-2 text-right font-medium text-muted-foreground">Exit Price</th>
                            <th className="px-2 py-2 text-right font-medium text-muted-foreground">Net P&amp;L</th>
                            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Exit reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...closedTrades].reverse().map((trade) => (
                            <tr key={trade.id} className="border-b border-border/20 hover:bg-muted/30">
                              <td className="px-2 py-2">{new Date(trade.entryTime).toLocaleDateString()}</td>
                              <td className="px-2 py-2">
                                {trade.exitTime ? new Date(trade.exitTime).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Badge
                                  variant="outline"
                                  className={trade.type === 'buy'
                                    ? 'border-green-500/30 bg-green-500/10 text-green-500'
                                    : 'border-red-500/30 bg-red-500/10 text-red-500'}
                                >
                                  {trade.type === 'buy' ? 'LONG' : 'SHORT'}
                                </Badge>
                              </td>
                              <td className="px-2 py-2 text-right font-mono">${trade.entryPrice.toFixed(4)}</td>
                              <td className="px-2 py-2 text-right font-mono">
                                {trade.exitPrice === undefined ? '-' : `$${trade.exitPrice.toFixed(4)}`}
                              </td>
                              <td className={`px-2 py-2 text-right font-mono ${(trade.pnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                ${(trade.pnl ?? 0).toFixed(2)} ({((trade.pnlPercent ?? 0) * 100).toFixed(2)}%)
                              </td>
                              <td className="px-2 py-2 capitalize text-muted-foreground">
                                {trade.exitReason?.replaceAll('_', ' ') ?? '-'}
                              </td>
                            </tr>
                          ))}
                          {closedTrades.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-4 text-center text-muted-foreground">
                                No trades executed
                              </td>
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

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">
        {label}
        <Input
          className="mt-1"
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(numberFromInput(event.target.value))}
        />
      </label>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}

function MetricCard({ label, value, tone }: MetricCardProps) {
  const color = tone === 'positive'
    ? 'text-green-500'
    : tone === 'negative' ? 'text-red-500' : '';

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
