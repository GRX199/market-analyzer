'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useBinanceWebSocket, KlineData } from '@/hooks/useBinanceWebSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity, Zap, Volume2, VolumeX, Flame, BookOpen, Bot, CandlestickChart, TrendingUp, TrendingDown, Minus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ALL_SYMBOLS } from '@/lib/constants';
import { useUserStore } from '@/stores/user-store';

// Sound Generator
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

export default function ScalpingDashboard() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | null>(null);
  const lastOrderTime = useRef<number>(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const { currentPrice, recentTrades, orderBook, currentKline, klineHistory, isConnected } = useBinanceWebSocket(symbol);

  // ===========================
  // ORDER FLOW (200 Trades)
  // ===========================
  const { buyVolume, sellVolume, totalVolume } = useMemo(() => {
    let buy = 0, sell = 0;
    recentTrades.forEach(t => { if (t.isBuyerMaker) sell += t.qty; else buy += t.qty; });
    return { buyVolume: buy, sellVolume: sell, totalVolume: buy + sell };
  }, [recentTrades]);
  const buyPressurePct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // ===========================
  // MOMENTUM CANDLE ENGINE (Inti Strategi Baru)
  // ===========================
  const momentum = useMemo(() => {
    // Butuh minimal 5 candle selesai + 1 candle berjalan
    if (klineHistory.length < 5 || !currentKline) {
      return { direction: 'wait' as const, streak: 0, strength: 0, volumeOK: false, details: [] as string[] };
    }

    // Ambil 3 candle terakhir yang sudah selesai
    const last3 = klineHistory.slice(-3);
    
    // Cek arah setiap candle: bullish (close > open) atau bearish (close < open)
    const directions = last3.map(k => k.close > k.open ? 'up' : k.close < k.open ? 'down' : 'flat');
    
    // Hitung ukuran body relatif (kekuatan momentum)
    const bodies = last3.map(k => Math.abs(k.close - k.open));
    const avgBody = bodies.reduce((s, b) => s + b, 0) / bodies.length;
    
    // Cek apakah body semakin membesar (akselerasi momentum)
    const isAccelerating = bodies[2] > bodies[1] && bodies[1] > bodies[0];
    
    // Hitung volume rata-rata dan cek spike
    const avgVol = klineHistory.reduce((s, k) => s + k.volume, 0) / klineHistory.length;
    const currentVol = currentKline.volume;
    const volumeOK = currentVol >= avgVol * 1.2; // 1.2x (lebih rendah untuk frekuensi tinggi)
    
    // Cek arah candle saat ini (yang sedang berjalan)
    const currentDir = currentKline.close > currentKline.open ? 'up' : currentKline.close < currentKline.open ? 'down' : 'flat';

    // Hitung beruntun (streak)
    let bullStreak = 0, bearStreak = 0;
    for (let i = directions.length - 1; i >= 0; i--) {
      if (directions[i] === 'up') bullStreak++;
      else break;
    }
    for (let i = directions.length - 1; i >= 0; i--) {
      if (directions[i] === 'down') bearStreak++;
      else break;
    }

    // SINYAL BUY: 2+ candle hijau beruntun + candle saat ini juga hijau
    // SINYAL SELL: 2+ candle merah beruntun + candle saat ini juga merah
    let direction: 'buy' | 'sell' | 'wait' = 'wait';
    let streak = 0;

    if (bullStreak >= 2 && currentDir === 'up') {
      direction = 'buy';
      streak = bullStreak;
    } else if (bearStreak >= 2 && currentDir === 'down') {
      direction = 'sell';
      streak = bearStreak;
    }

    // Kekuatan momentum (0-100)
    const strength = Math.min(100, (streak * 25) + (isAccelerating ? 25 : 0) + (volumeOK ? 25 : 0));

    const details: string[] = [];
    if (bullStreak >= 2) details.push(`${bullStreak} candle hijau beruntun`);
    if (bearStreak >= 2) details.push(`${bearStreak} candle merah beruntun`);
    if (isAccelerating) details.push('Body candle membesar (akselerasi)');
    if (volumeOK) details.push(`Volume ${(currentVol/avgVol).toFixed(1)}x rata-rata`);

    return { direction, streak, strength, volumeOK, details };
  }, [klineHistory, currentKline]);

  // Candle history visual (last 10)
  const candleDisplay = useMemo(() => {
    const all = [...klineHistory.slice(-9)];
    if (currentKline) all.push(currentKline);
    return all;
  }, [klineHistory, currentKline]);

  // Price direction visual
  const prevPriceRef = useRef(currentPrice);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'flat'>('flat');
  useEffect(() => {
    if (currentPrice > prevPriceRef.current) setPriceDirection('up');
    else if (currentPrice < prevPriceRef.current) setPriceDirection('down');
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Cooldown timer visual
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, 10000 - (Date.now() - lastOrderTime.current));
      setCooldownLeft(Math.ceil(remaining / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // ===========================
  // SIGNAL EXECUTION (Momentum Candle)
  // ===========================
  useEffect(() => {
    if (klineHistory.length < 5) return;

    const now = Date.now();
    // 10 detik cooldown (frekuensi tinggi)
    if (now - lastOrderTime.current < 10000) return;

    if (momentum.direction === 'buy' && momentum.strength >= 50 && flashSignal !== 'buy') {
      setFlashSignal('buy');
      lastOrderTime.current = now;
      if (isAudioEnabled) playAlertSound('buy');
      setTimeout(() => setFlashSignal(null), 1500);
    } 
    else if (momentum.direction === 'sell' && momentum.strength >= 50 && flashSignal !== 'sell') {
      setFlashSignal('sell');
      lastOrderTime.current = now;
      if (isAudioEnabled) playAlertSound('sell');
      setTimeout(() => setFlashSignal(null), 1500);
    }
  }, [momentum, isAudioEnabled, klineHistory.length, flashSignal]);

  const cryptoSymbols = ALL_SYMBOLS.filter(s => s.marketType === 'crypto');

  return (
    <DashboardLayout>
      {/* Background Flash */}
      <div className={cn(
        "fixed inset-0 pointer-events-none transition-colors duration-500 z-0",
        flashSignal === 'buy' ? "bg-green-500/10" : flashSignal === 'sell' ? "bg-red-500/10" : "bg-transparent"
      )} />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              <h1 className="text-2xl font-black uppercase tracking-tighter">Momentum Scalper</h1>
              <Badge variant="outline" className="text-xs">v5 Candle</Badge>
            </div>
            <Badge variant={isConnected ? "default" : "destructive"} className={isConnected ? "bg-emerald-500" : ""}>
              {isConnected ? "LIVE" : "..."}
            </Badge>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[160px] font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cryptoSymbols.map(s => (
                  <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant={isAudioEnabled ? "default" : "outline"} className={isAudioEnabled ? "bg-blue-600 hover:bg-blue-700" : ""} onClick={() => setIsAudioEnabled(!isAudioEnabled)}>
              {isAudioEnabled ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
              {isAudioEnabled ? "🔊" : "🔇"}
            </Button>
            
            <Button 
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 animate-pulse cursor-default"
            >
              <Bot className="h-4 w-4 mr-2" />
              PYTHON HFT RUNNING LOKAL
            </Button>

            <Dialog>
              {/* @ts-expect-error asChild */}
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><BookOpen className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Momentum Scalper v5 Guide</DialogTitle></DialogHeader>
                <ScrollArea className="h-[60vh] mt-4 pr-4">
                  <div className="space-y-6 text-sm">
                    <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20">
                      <strong>⚠️</strong> Scalping = risiko tinggi. Gunakan uang yang siap hilang.
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-2">Cara Kerja v5 (Momentum Candle)</h3>
                      <p className="text-muted-foreground mb-2">Robot mendeteksi momentum berdasarkan arah candle 1 menit:</p>
                      <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
                        <li><strong className="text-foreground">2+ Candle Beruntun:</strong> Jika 2 atau lebih candle 1-menit berturut-turut hijau → momentum naik.</li>
                        <li><strong className="text-foreground">Candle Saat Ini Konfirmasi:</strong> Candle yang sedang berjalan harus searah.</li>
                        <li><strong className="text-foreground">Fixed TP Kecil:</strong> Robot langsung ambil profit 0.10% (~$60 BTC) tanpa menunggu.</li>
                        <li><strong className="text-foreground">Cooldown 10 Detik:</strong> Frekuensi tinggi tapi terkendali.</li>
                      </ol>
                    </div>
                    <div className="bg-primary/10 p-3 rounded border border-primary/20">
                      💡 <strong>Filosofi:</strong> Ikuti arus momentum. Jika candle terus hijau, ikut beli. Ambil untung kecil, lari cepat. Ulangi.
                    </div>
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Momentum Status + Price */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Live Price */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Live Price</div>
              <div className={cn(
                "text-3xl md:text-4xl font-black tabular-nums transition-colors duration-200",
                priceDirection === 'up' ? "text-green-500" : priceDirection === 'down' ? "text-red-500" : "text-foreground"
              )}>
                {currentPrice > 0 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}
              </div>
            </CardContent>
          </Card>

          {/* Momentum Direction */}
          <Card className={cn("border-2", momentum.direction === 'buy' ? "border-green-500/50 bg-green-500/5" : momentum.direction === 'sell' ? "border-red-500/50 bg-red-500/5" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Momentum</div>
              <div className="flex items-center justify-center gap-2">
                {momentum.direction === 'buy' ? <TrendingUp className="h-6 w-6 text-green-500" /> : momentum.direction === 'sell' ? <TrendingDown className="h-6 w-6 text-red-500" /> : <Minus className="h-6 w-6 text-muted-foreground" />}
                <span className={cn("text-xl font-black", momentum.direction === 'buy' ? "text-green-500" : momentum.direction === 'sell' ? "text-red-500" : "text-muted-foreground")}>
                  {momentum.direction === 'buy' ? `↑ BUY` : momentum.direction === 'sell' ? `↓ SELL` : 'STANDBY'}
                </span>
              </div>
              {momentum.streak > 0 && <div className="text-xs text-muted-foreground mt-1">{momentum.streak} candle beruntun</div>}
            </CardContent>
          </Card>

          {/* Strength Gauge */}
          <Card className={cn("border-2", momentum.strength >= 50 ? "border-green-500/50" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Kekuatan</div>
              <div className={cn("text-3xl font-black", momentum.strength >= 75 ? "text-green-500" : momentum.strength >= 50 ? "text-yellow-500" : "text-muted-foreground")}>
                {momentum.strength}%
              </div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div className={cn("h-full rounded-full transition-all", momentum.strength >= 75 ? "bg-green-500" : momentum.strength >= 50 ? "bg-yellow-500" : "bg-muted-foreground/30")} style={{ width: `${momentum.strength}%` }} />
              </div>
            </CardContent>
          </Card>

          {/* Cooldown Timer */}
          <Card className={cn("border-2", cooldownLeft > 0 ? "border-yellow-500/50 bg-yellow-500/5" : "border-muted")}>
            <CardContent className="p-4 text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Cooldown</div>
              {cooldownLeft > 0 ? (
                <>
                  <div className="text-3xl font-black text-yellow-500">{cooldownLeft}s</div>
                  <div className="text-xs text-muted-foreground">Menunggu...</div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-black text-green-500">✓</div>
                  <div className="text-xs text-muted-foreground">Siap tembak</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Candle History Visual + Signal Badge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CandlestickChart className="h-4 w-4" /> Candle 1 Menit (Momentum Tracker)
              {flashSignal === 'buy' && <Badge className="bg-green-500 text-white animate-pulse ml-auto">⚡ MOMENTUM BUY</Badge>}
              {flashSignal === 'sell' && <Badge className="bg-red-500 text-white animate-pulse ml-auto">⚡ MOMENTUM SELL</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-[120px] justify-center">
              {candleDisplay.map((k, i) => {
                const isBullish = k.close >= k.open;
                const range = k.high - k.low;
                const bodyTop = Math.max(k.open, k.close);
                const bodyBot = Math.min(k.open, k.close);
                const bodyH = range > 0 ? Math.max(4, ((bodyTop - bodyBot) / range) * 100) : 4;
                const wickTopH = range > 0 ? ((k.high - bodyTop) / range) * 100 : 0;
                const wickBotH = range > 0 ? ((bodyBot - k.low) / range) * 100 : 0;
                const isLast = i === candleDisplay.length - 1;
                
                return (
                  <div key={k.startTime} className={cn("flex flex-col items-center", isLast ? "opacity-100" : "opacity-70")} style={{ width: '28px' }}>
                    {/* Wick atas */}
                    <div className={cn("w-[2px]", isBullish ? "bg-green-500" : "bg-red-500")} style={{ height: `${wickTopH}%` }} />
                    {/* Body */}
                    <div className={cn("w-full rounded-sm", isBullish ? "bg-green-500" : "bg-red-500", isLast && "ring-2 ring-yellow-400")} style={{ height: `${bodyH}%`, minHeight: '4px' }} />
                    {/* Wick bawah */}
                    <div className={cn("w-[2px]", isBullish ? "bg-green-500" : "bg-red-500")} style={{ height: `${wickBotH}%` }} />
                  </div>
                );
              })}
            </div>
            {momentum.details.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {momentum.details.map((d, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Flow + Order Book + Tape */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Order Flow */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> Order Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div>
                    <div className="text-2xl font-black text-green-500">{buyPressurePct.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Buy</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-red-500">{(100 - buyPressurePct).toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Sell</div>
                  </div>
                </div>
                <div className="h-4 w-full bg-red-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${buyPressurePct}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Book */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Flame className="h-4 w-4" /> Depth 5</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-bold text-muted-foreground mb-1">ASK</div>
                  {[...orderBook.asks].reverse().map((a, i) => (
                    <div key={i} className="flex justify-between tabular-nums py-0.5">
                      <span className="text-red-500">{a[0].toFixed(2)}</span>
                      <span>{a[1].toFixed(4)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-bold text-muted-foreground mb-1">BID</div>
                  {orderBook.bids.map((b, i) => (
                    <div key={i} className="flex justify-between tabular-nums py-0.5">
                      <span className="text-green-500">{b[0].toFixed(2)}</span>
                      <span>{b[1].toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tape */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Tape</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0.5 h-[180px] overflow-hidden">
                {recentTrades.slice(0, 12).map((t, i) => (
                  <div key={t.time + i} className="grid grid-cols-3 text-xs tabular-nums">
                    <span className="text-muted-foreground">{new Date(t.time).toISOString().substring(11, 19)}</span>
                    <span className={t.isBuyerMaker ? "text-red-500" : "text-green-500"}>{t.price.toFixed(2)}</span>
                    <span className="text-right">{t.qty.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
