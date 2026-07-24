'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useBinanceWebSocket, KlineData } from '@/hooks/useBinanceWebSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity, Zap, Volume2, VolumeX, Flame, BookOpen, Bot, CandlestickChart, TrendingUp, TrendingDown, Minus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ALL_SYMBOLS } from '@/lib/constants';
import { useUserStore } from '@/stores/user-store';

// ===========================
// UTILS
// ===========================
const playAlertSound = (type: 'buy' | 'sell') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    if (type === 'buy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) { console.error('Audio failed', e); }
};

function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  ema.push(sum / period);
  for (let i = period; i < closes.length; i++) {
    ema.push(closes[i] * multiplier + ema[ema.length - 1] * (1 - multiplier));
  }
  return ema;
}

// ===========================
// MAIN COMPONENT (v7)
// ===========================
export default function ScalpingDashboard() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isAutoTradingEnabled, setIsAutoTradingEnabled] = useState(false);
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | null>(null);
  const lastOrderTime = useRef<number>(0);

  const { currentPrice, recentTrades, orderBook, currentKline, klineHistory, isConnected } = useBinanceWebSocket(symbol);
  const { createAutoTrade } = useUserStore();

  // 1. Order Flow
  const { buyVolume, sellVolume, totalVolume } = useMemo(() => {
    let buy = 0, sell = 0;
    recentTrades.forEach(t => { if (t.isBuyerMaker) sell += t.qty; else buy += t.qty; });
    return { buyVolume: buy, sellVolume: sell, totalVolume: buy + sell };
  }, [recentTrades]);
  const buyPressurePct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // 2. EMA Filter (Tren Utama)
  const emaSignal = useMemo(() => {
    const allKlines = [...klineHistory];
    if (currentKline) allKlines.push(currentKline);
    if (allKlines.length < 14) return 'wait';

    const closes = allKlines.map(k => k.close);
    const ema5 = calculateEMA(closes, 5);
    const ema13 = calculateEMA(closes, 13);
    
    if (ema5.length === 0 || ema13.length === 0) return 'wait';
    const lastEma5 = ema5[ema5.length - 1];
    const lastEma13 = ema13[ema13.length - 1];
    
    return lastEma5 > lastEma13 ? 'bullish' : lastEma5 < lastEma13 ? 'bearish' : 'neutral';
  }, [klineHistory, currentKline]);

  // 3. Momentum Candle (Diubah jadi 2 candle: 1 tutup + 1 berjalan agar lebih responsif)
  const momentum = useMemo(() => {
    if (klineHistory.length < 2 || !currentKline) return { direction: 'wait', strength: 0 };
    
    const last1 = klineHistory[klineHistory.length - 1];
    const dir1 = last1.close >= last1.open ? 'up' : 'down';
    const currDir = currentKline.close >= currentKline.open ? 'up' : 'down';

    if (dir1 === 'up' && currDir === 'up') return { direction: 'buy', strength: 100 };
    if (dir1 === 'down' && currDir === 'down') return { direction: 'sell', strength: 100 };
    
    return { direction: 'wait', strength: 0 };
  }, [klineHistory, currentKline]);

  // ===========================
  // SIGNAL EXECUTION (Hybrid)
  // ===========================
  useEffect(() => {
    const now = Date.now();
    // Cooldown 15 detik untuk membatasi sinyal ganda yang lolos
    if (now - lastOrderTime.current < 15000) return;

    // Filter Ketat: Momentum SEARAH dengan EMA Tren
    const isBuyValid = momentum.direction === 'buy' && emaSignal === 'bullish';
    const isSellValid = momentum.direction === 'sell' && emaSignal === 'bearish';

    if (isBuyValid && flashSignal !== 'buy') {
      setFlashSignal('buy');
      lastOrderTime.current = now;
      if (isAudioEnabled) playAlertSound('buy');
      if (isAutoTradingEnabled) createAutoTrade(symbol, 'crypto', 'buy', 0.1);
      setTimeout(() => setFlashSignal(null), 1500);
    } 
    else if (isSellValid && flashSignal !== 'sell') {
      setFlashSignal('sell');
      lastOrderTime.current = now;
      if (isAudioEnabled) playAlertSound('sell');
      if (isAutoTradingEnabled) createAutoTrade(symbol, 'crypto', 'sell', 0.1);
      setTimeout(() => setFlashSignal(null), 1500);
    }
  }, [momentum, emaSignal, isAudioEnabled, isAutoTradingEnabled, flashSignal, symbol, createAutoTrade]);

  const candleDisplay = useMemo(() => {
    const all = [...klineHistory.slice(-9)];
    if (currentKline) all.push(currentKline);
    return all;
  }, [klineHistory, currentKline]);

  return (
    <DashboardLayout>
      <div className={cn("fixed inset-0 pointer-events-none transition-colors duration-500 z-0", flashSignal === 'buy' ? "bg-green-500/10" : flashSignal === 'sell' ? "bg-red-500/10" : "bg-transparent")} />

      <div className="relative z-10 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
              <h1 className="text-2xl font-black uppercase tracking-tighter">Ultimate Scalper</h1>
              <Badge variant="outline">v8 Ultimate</Badge>
            </div>
            <Badge variant={isConnected ? "default" : "destructive"}>{isConnected ? "LIVE" : "..."}</Badge>
          </div>

          <div className="flex items-center gap-3">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[140px] font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_SYMBOLS.filter(s => s.marketType === 'crypto').map(s => (
                  <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant={isAudioEnabled ? "default" : "outline"} className={isAudioEnabled ? "bg-blue-600" : ""} onClick={() => setIsAudioEnabled(!isAudioEnabled)}>
              {isAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            
            <Button 
              variant={isAutoTradingEnabled ? "default" : "outline"}
              className={isAutoTradingEnabled ? "bg-emerald-600 animate-pulse" : "border-emerald-500/50 text-emerald-500"}
              onClick={() => setIsAutoTradingEnabled(!isAutoTradingEnabled)}
            >
              <Bot className="h-4 w-4 mr-2" />
              {isAutoTradingEnabled ? "ROBOT ON" : "Robot"}
            </Button>

            <Button 
              variant="outline" 
              className="border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
              onClick={() => {
                createAutoTrade(symbol, 'crypto', 'buy', 0.1);
              }}
            >
              Force Test Signal
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Live Price</div>
              <div className="text-3xl font-black">{currentPrice > 0 ? currentPrice.toFixed(2) : "---"}</div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", emaSignal === 'bullish' ? "border-green-500/50" : emaSignal === 'bearish' ? "border-red-500/50" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Tren Utama (EMA 5/13)</div>
              <div className={cn("text-xl font-black", emaSignal === 'bullish' ? "text-green-500" : emaSignal === 'bearish' ? "text-red-500" : "text-muted-foreground")}>
                {emaSignal.toUpperCase()}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", momentum.direction === 'buy' ? "border-green-500/50" : momentum.direction === 'sell' ? "border-red-500/50" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Momentum Candle</div>
              <div className={cn("text-xl font-black", momentum.direction === 'buy' ? "text-green-500" : momentum.direction === 'sell' ? "text-red-500" : "text-muted-foreground")}>
                {momentum.direction === 'wait' ? 'WAIT' : `${momentum.direction.toUpperCase()} (2 Streak)`}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("border-2", (momentum.direction === 'buy' && emaSignal === 'bullish') || (momentum.direction === 'sell' && emaSignal === 'bearish') ? "border-emerald-500 bg-emerald-500/10 animate-pulse" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Sinyal Eksekusi</div>
              <div className="text-xl font-black text-foreground">
                {(momentum.direction === 'buy' && emaSignal === 'bullish') ? "🔥 BUY MATCH" : 
                 (momentum.direction === 'sell' && emaSignal === 'bearish') ? "🔥 SELL MATCH" : "STANDBY"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Candle Tracker</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-[120px] justify-center">
                {candleDisplay.map((k, i) => {
                  const isBullish = k.close >= k.open;
                  const range = k.high - k.low;
                  const bodyTop = Math.max(k.open, k.close);
                  const bodyBot = Math.min(k.open, k.close);
                  const bodyH = range > 0 ? Math.max(4, ((bodyTop - bodyBot) / range) * 100) : 4;
                  return (
                    <div key={k.startTime} className={cn("flex flex-col items-center", i === candleDisplay.length - 1 ? "opacity-100" : "opacity-70")} style={{ width: '28px' }}>
                      <div className={cn("w-full rounded-sm", isBullish ? "bg-green-500" : "bg-red-500")} style={{ height: `${bodyH}%`, minHeight: '8px' }} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Order Flow (Last 200)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-between mb-2">
                <span className="text-xl font-black text-green-500">{buyPressurePct.toFixed(1)}%</span>
                <span className="text-xl font-black text-red-500">{(100 - buyPressurePct).toFixed(1)}%</span>
              </div>
              <div className="h-4 w-full bg-red-500/20 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${buyPressurePct}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
