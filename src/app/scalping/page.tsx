'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Activity, Zap, Volume2, VolumeX, Flame, BookOpen, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ALL_SYMBOLS } from '@/lib/constants';
import { useUserStore } from '@/stores/user-store';

// Sound Generator using Web Audio API
const playAlertSound = (type: 'buy' | 'sell') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === 'buy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.2); // A3
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.error('Audio play failed', e);
  }
};

export default function ScalpingDashboard() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isAutoTradingEnabled, setIsAutoTradingEnabled] = useState(false);
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | null>(null);

  const { currentPrice, recentTrades, orderBook, currentKline, isConnected } = useBinanceWebSocket(symbol);
  const { createAutoTrade } = useUserStore();

  // Derived Metrics
  const { buyVolume, sellVolume, totalVolume } = useMemo(() => {
    let bVol = 0;
    let sVol = 0;
    recentTrades.forEach(t => {
      // isBuyerMaker = true means seller matched with a buyer maker -> it's a SELL market order
      if (t.isBuyerMaker) sVol += t.qty;
      else bVol += t.qty; 
    });
    return { buyVolume: bVol, sellVolume: sVol, totalVolume: bVol + sVol };
  }, [recentTrades]);

  const buyPressurePct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

  // Track price momentum
  const prevPriceRef = useRef(currentPrice);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'flat'>('flat');

  useEffect(() => {
    if (currentPrice > prevPriceRef.current) setPriceDirection('up');
    else if (currentPrice < prevPriceRef.current) setPriceDirection('down');
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Alert Logic (Overkill Scalping Engine)
  useEffect(() => {
    if (recentTrades.length < 20) return;

    // Extreme Buy Pressure > 85%
    if (buyPressurePct > 85 && flashSignal !== 'buy') {
      setFlashSignal('buy');
      if (isAudioEnabled) playAlertSound('buy');
      if (isAutoTradingEnabled) createAutoTrade(symbol, 'crypto', 'buy', 0.1);
      setTimeout(() => setFlashSignal(null), 1000);
    } else if (buyPressurePct < 15 && flashSignal !== 'sell') {
      setFlashSignal('sell');
      if (isAudioEnabled) playAlertSound('sell');
      if (isAutoTradingEnabled) createAutoTrade(symbol, 'crypto', 'sell', 0.1);
      setTimeout(() => setFlashSignal(null), 1000);
    }
  }, [buyPressurePct, isAudioEnabled, isAutoTradingEnabled, recentTrades.length, flashSignal, symbol, createAutoTrade]);

  const cryptoSymbols = ALL_SYMBOLS.filter(s => s.marketType === 'crypto');

  return (
    <DashboardLayout>
      {/* Background Flash Effect */}
      <div className={cn(
        "fixed inset-0 pointer-events-none transition-colors duration-500 z-0",
        flashSignal === 'buy' ? "bg-green-500/10" : flashSignal === 'sell' ? "bg-red-500/10" : "bg-transparent"
      )} />

      <div className="relative z-10 space-y-6">
        {/* Header Control Panel */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              <h1 className="text-2xl font-black uppercase tracking-tighter">Hyper Scalping</h1>
            </div>
            <Badge variant={isConnected ? "default" : "destructive"} className={isConnected ? "bg-emerald-500" : ""}>
              {isConnected ? "WS Connected" : "Connecting..."}
            </Badge>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[180px] font-bold">
                <SelectValue placeholder="Select Asset" />
              </SelectTrigger>
              <SelectContent>
                {cryptoSymbols.map(s => (
                  <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant={isAudioEnabled ? "default" : "outline"}
              className={isAudioEnabled ? "bg-blue-600 hover:bg-blue-700" : ""}
              onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            >
              {isAudioEnabled ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
              {isAudioEnabled ? "Audio Alerts ON" : "Audio Alerts OFF"}
            </Button>
            
            <Button 
              variant={isAutoTradingEnabled ? "default" : "outline"}
              className={isAutoTradingEnabled ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse" : "border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"}
              onClick={() => setIsAutoTradingEnabled(!isAutoTradingEnabled)}
            >
              <Bot className="h-4 w-4 mr-2" />
              {isAutoTradingEnabled ? "ROBOT ACTIVE" : "Enable Robot"}
            </Button>
            
            <Dialog>
              {/* @ts-expect-error asChild is used by Shadcn but Base UI might use render */}
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <BookOpen className="h-4 w-4" /> Guide
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Ultimate Scalping Guide</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh] mt-4 pr-4">
                  <div className="space-y-6 text-sm">
                    <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20">
                      <strong>⚠️ Risiko Ekstrem:</strong> Scalping memiliki risiko yang sangat tinggi karena Anda bertransaksi dengan jumlah lot/leverage besar untuk mengejar pergerakan 0.1% hingga 1%. Pastikan Anda menggunakan Stop Loss yang ketat.
                    </div>

                    <div>
                      <h3 className="text-lg font-bold mb-2">1. Real-Time Order Flow (Pressure Gauge)</h3>
                      <p className="text-muted-foreground mb-2">Menghitung 50 transaksi real-time terakhir secara instan.</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li><strong className="text-green-500">Buy Pressure:</strong> Persentase transaksi yang dibeli secara agresif.</li>
                        <li><strong className="text-red-500">Sell Pressure:</strong> Persentase transaksi yang dijual secara agresif.</li>
                      </ul>
                      <div className="bg-primary/10 p-3 rounded mt-2 border border-primary/20">
                        💡 <strong>TIP:</strong> Jika Buy Pressure melonjak di atas 80%, ini menandakan ada Whale yang sedang masuk. Momen terbaik untuk menumpang naik.
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold mb-2">2. Order Book (Depth 5)</h3>
                      <p className="text-muted-foreground mb-2">Buku Antrean menunjukkan tembok pertahanan harga.</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li><strong className="text-green-500">Bid (Bawah):</strong> Mengantre ingin membeli di harga murah.</li>
                        <li><strong className="text-red-500">Ask (Atas):</strong> Mengantre ingin menjual di harga mahal.</li>
                      </ul>
                      <p className="mt-2 text-muted-foreground">Jika ada jumlah (Amount) raksasa di Ask, itu adalah Resistance Buatan. Jika tertembus, harga biasanya meledak naik (Breakout Scalping).</p>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold mb-2">3. Strategi: Momentum Breakout (Audio)</h3>
                      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                        <li>Nyalakan <strong>Audio Alerts ON</strong>.</li>
                        <li>Tunggu sampai alarm berbunyi keras dan layar berkedip Hijau.</li>
                        <li>Artinya Buy Pressure menembus 85%. Langsung eksekusi Buy/Long.</li>
                        <li>Take Profit saat naik 0.3% - 0.5%.</li>
                        <li>Stop Loss otomatis di 0.3% di bawah harga beli.</li>
                      </ol>
                    </div>

                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Top Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 overflow-hidden border-2 border-primary/20">
            <CardContent className="p-6 flex flex-col items-center justify-center min-h-[160px]">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-2">Live Price</div>
              <div className={cn(
                "text-5xl md:text-6xl font-black tabular-nums transition-colors duration-200",
                priceDirection === 'up' ? "text-green-500" : priceDirection === 'down' ? "text-red-500" : "text-foreground"
              )}>
                {currentPrice > 0 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "---"}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> Real-time Order Flow (Last 50 Trades)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-2">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-3xl font-black text-green-500">{buyPressurePct.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Buy Pressure</div>
                  </div>
                  {flashSignal === 'buy' && <Badge className="bg-green-500 text-white animate-pulse px-4 py-1 text-lg">STRONG BUY SIGNAL</Badge>}
                  {flashSignal === 'sell' && <Badge className="bg-red-500 text-white animate-pulse px-4 py-1 text-lg">STRONG SELL SIGNAL</Badge>}
                  <div className="text-right">
                    <div className="text-3xl font-black text-red-500">{(100 - buyPressurePct).toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground uppercase font-semibold">Sell Pressure</div>
                  </div>
                </div>
                
                <div className="h-6 w-full bg-red-500/20 rounded-full overflow-hidden flex relative">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300 ease-out"
                    style={{ width: `${buyPressurePct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-50">
                    <div className="w-1 h-full bg-white/50" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tape and DOM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4" /> Order Book (Depth 5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-muted-foreground mb-2 grid grid-cols-2">
                    <span>ASK PRICE</span>
                    <span className="text-right">AMOUNT</span>
                  </div>
                  <div className="space-y-1">
                    {[...orderBook.asks].reverse().map((ask, i) => (
                      <div key={i} className="grid grid-cols-2 text-sm tabular-nums relative overflow-hidden rounded px-1 py-0.5">
                        <div className="absolute inset-0 bg-red-500/10 origin-right" style={{ transform: `scaleX(${Math.min(ask[1]/2, 1)})` }} />
                        <span className="text-red-500 font-medium z-10">{ask[0].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                        <span className="text-right z-10">{ask[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground mb-2 grid grid-cols-2">
                    <span>BID PRICE</span>
                    <span className="text-right">AMOUNT</span>
                  </div>
                  <div className="space-y-1">
                    {orderBook.bids.map((bid, i) => (
                      <div key={i} className="grid grid-cols-2 text-sm tabular-nums relative overflow-hidden rounded px-1 py-0.5">
                        <div className="absolute inset-0 bg-green-500/10 origin-left" style={{ transform: `scaleX(${Math.min(bid[1]/2, 1)})` }} />
                        <span className="text-green-500 font-medium z-10">{bid[0].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                        <span className="text-right z-10">{bid[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Time & Sales (Live Tape)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 text-xs font-bold text-muted-foreground mb-2">
                <span>TIME</span>
                <span>PRICE</span>
                <span className="text-right">QTY</span>
              </div>
              <div className="space-y-1 h-[200px] overflow-hidden flex flex-col justify-start relative">
                {recentTrades.slice(0, 10).map((t, i) => (
                  <div key={t.time + i} className="grid grid-cols-3 text-sm tabular-nums animate-in fade-in slide-in-from-top-1">
                    <span className="text-muted-foreground">{new Date(t.time).toISOString().substring(11, 19)}</span>
                    <span className={t.isBuyerMaker ? "text-red-500 font-medium" : "text-green-500 font-medium"}>
                      {t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </span>
                    <span className="text-right">{t.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  </div>
                ))}
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
              </div>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </DashboardLayout>
  );
}
