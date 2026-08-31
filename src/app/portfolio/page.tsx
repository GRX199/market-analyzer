'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useUserStore } from '@/stores/user-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AllocationChart } from '@/components/portfolio/allocation-chart';
import { PerformanceChart } from '@/components/portfolio/performance-chart';
import { PositionTable } from '@/components/portfolio/position-table';
import { EmptyState } from '@/components/common/empty-state';
import { PortfolioPosition } from '@/types/portfolio';
import { MarketType } from '@/types/market';
import { ALL_SYMBOLS } from '@/lib/constants';
import {
  Wallet, Plus, TrendingUp, TrendingDown, DollarSign,
  PieChart, BarChart3, ListFilter, Briefcase,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PortfolioPage() {
  const {
    positions, portfolioHistory,
    addPosition, closePosition, removePosition, snapshotPortfolio,
  } = useUserStore();
  const prices = useRealtimeStore((state) => state.prices);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'closed'>('all');

  // New position form state
  const [form, setForm] = useState({
    symbol: '',
    name: '',
    marketType: 'crypto' as MarketType,
    type: 'buy' as 'buy' | 'sell',
    quantity: '',
    entryPrice: '',
  });

  // Update positions with real-time prices
  useEffect(() => {
    if (!prices || Object.keys(prices).length === 0) return;
    const { updatePositionPrice } = useUserStore.getState();
    
    positions.filter(p => p.isOpen).forEach(pos => {
      let streamSymbol = pos.symbol;
      if (pos.marketType === 'crypto') {
        streamSymbol = pos.symbol.replace('/', '').toUpperCase();
      }
      const priceData = prices[streamSymbol];
      if (priceData && priceData.current !== pos.currentPrice) {
        updatePositionPrice(pos.symbol, priceData.current);
      }
    });
  }, [prices, positions]);

  // Portfolio calculations
  const summary = useMemo(() => {
    const openPos = positions.filter(p => p.isOpen);
    const closedPos = positions.filter(p => !p.isOpen);

    let totalInvested = 0;
    let totalCurrentValue = 0;

    openPos.forEach(pos => {
      const invested = pos.entryPrice * pos.quantity;
      const currentVal = pos.currentPrice * pos.quantity;
      totalInvested += invested;
      if (pos.type === 'buy') {
        totalCurrentValue += currentVal;
      } else {
        totalCurrentValue += invested + (invested - currentVal);
      }
    });

    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    // Win rate from closed positions
    const wins = closedPos.filter(p => {
      const closePrice = p.closedPrice || p.currentPrice;
      return p.type === 'buy' ? closePrice > p.entryPrice : closePrice < p.entryPrice;
    }).length;
    const winRate = closedPos.length > 0 ? (wins / closedPos.length) * 100 : 0;

    return { totalInvested, totalCurrentValue, totalPnl, totalPnlPercent, openPositions: openPos.length, closedPositions: closedPos.length, winRate };
  }, [positions]);

  // Auto-snapshot portfolio daily
  useEffect(() => {
    if (positions.filter(p => p.isOpen).length > 0 && summary.totalCurrentValue > 0) {
      snapshotPortfolio(summary.totalCurrentValue, summary.totalPnl, summary.totalPnlPercent);
    }
  }, [summary.totalCurrentValue, summary.totalPnl, summary.totalPnlPercent, positions, snapshotPortfolio]);

  const handleAddPosition = () => {
    if (!form.symbol || !form.quantity || !form.entryPrice) return;

    const newPosition: PortfolioPosition = {
      id: Date.now().toString(),
      symbol: form.symbol,
      name: form.name || form.symbol,
      marketType: form.marketType,
      type: form.type,
      quantity: parseFloat(form.quantity),
      entryPrice: parseFloat(form.entryPrice),
      currentPrice: parseFloat(form.entryPrice),
      isOpen: true,
      createdAt: new Date().toISOString(),
    };

    addPosition(newPosition);
    setIsDialogOpen(false);
    setForm({ symbol: '', name: '', marketType: 'crypto', type: 'buy', quantity: '', entryPrice: '' });
  };

  // Auto-fill name when symbol is selected from known list
  const handleSymbolSelect = (symbol: string) => {
    const found = ALL_SYMBOLS.find(s => s.symbol === symbol);
    if (found) {
      setForm(prev => ({
        ...prev,
        symbol: found.symbol,
        name: found.name,
        marketType: found.marketType,
      }));
    }
  };

  const filteredPositions = useMemo(() => {
    if (filterTab === 'open') return positions.filter(p => p.isOpen);
    if (filterTab === 'closed') return positions.filter(p => !p.isOpen);
    return positions;
  }, [positions, filterTab]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Wallet className="w-7 h-7 text-primary" />
              Portfolio Tracker
            </h1>
            <p className="text-muted-foreground mt-1">Track your simulated positions and performance across all markets.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<Button className="gap-2 shrink-0" />}>
              <Plus className="h-4 w-4" /> Add Position
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Position</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Asset Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asset</label>
                  <Select onValueChange={(v: any) => v && handleSymbolSelect(String(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset or type custom" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {ALL_SYMBOLS.map(s => (
                        <SelectItem key={s.symbol} value={s.symbol}>
                          {s.symbol} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Or type custom symbol (e.g. PEPE/USDT)"
                    value={form.symbol}
                    onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                  />
                </div>

                {/* Market Type & Direction */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Market</label>
                    <Select value={form.marketType} onValueChange={(v: any) => setForm({ ...form, marketType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crypto">₿ Crypto</SelectItem>
                        <SelectItem value="stocks">📈 Stocks</SelectItem>
                        <SelectItem value="forex">💱 Forex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Direction</label>
                    <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buy">🟢 Buy (Long)</SelectItem>
                        <SelectItem value="sell">🔴 Sell (Short)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Quantity & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity</label>
                    <Input
                      type="number"
                      placeholder="e.g. 0.5"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Entry Price ($)</label>
                    <Input
                      type="number"
                      placeholder="e.g. 62500"
                      value={form.entryPrice}
                      onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
                    />
                  </div>
                </div>

                <Button className="w-full mt-2" onClick={handleAddPosition} disabled={!form.symbol || !form.quantity || !form.entryPrice}>
                  Add Position
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-lg font-bold font-mono">
                  ${summary.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`p-2.5 rounded-xl ${summary.totalPnl >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {summary.totalPnl >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total P&L</p>
                <p className={`text-lg font-bold font-mono ${summary.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className={`text-xs font-mono ${summary.totalPnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {summary.totalPnlPercent >= 0 ? '+' : ''}{summary.totalPnlPercent.toFixed(2)}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Positions</p>
                <p className="text-lg font-bold font-mono">{summary.openPositions}</p>
                <p className="text-xs text-muted-foreground">{summary.closedPositions} closed</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-lg font-bold font-mono">{summary.winRate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">closed trades</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        {positions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-primary" />
                  Asset Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart positions={positions} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Portfolio Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceChart history={portfolioHistory} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Positions Table */}
        {positions.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListFilter className="h-4 w-4 text-primary" />
                  Positions
                </CardTitle>
                <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as any)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs px-3 h-6">All</TabsTrigger>
                    <TabsTrigger value="open" className="text-xs px-3 h-6">Open</TabsTrigger>
                    <TabsTrigger value="closed" className="text-xs px-3 h-6">Closed</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0 md:p-6 md:pt-0">
              <PositionTable
                positions={filteredPositions}
                onClose={(id, price) => closePosition(id, price)}
                onRemove={(id) => removePosition(id)}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Wallet}
            title="No positions yet"
            description="Start tracking your simulated trades by adding your first position. All data is stored locally in your browser."
            action={
              <Button className="mt-4 gap-2" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4" /> Add First Position
              </Button>
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
