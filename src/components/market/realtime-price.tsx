'use client';

import { useEffect, useState } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { cn } from '@/lib/utils';
import { MarketType } from '@/types/market';

interface RealtimePriceProps {
  symbol: string;         // e.g. "BTC/USDT"
  marketType: MarketType; // e.g. "crypto"
  initialPrice: number;
  className?: string;
}

export function RealtimePrice({ symbol, marketType, initialPrice, className }: RealtimePriceProps) {
  // Only crypto is supported for real-time WebSocket right now
  const isEligible = marketType === 'crypto';
  
  // Convert "BTC/USDT" to "BTCUSDT" for Binance mapping
  const binanceSymbol = isEligible ? symbol.replace('/', '').toUpperCase() : '';

  // Get price data specifically for this symbol to minimize re-renders
  const priceData = useRealtimeStore((state) => 
    isEligible ? state.prices[binanceSymbol] : undefined
  );

  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    // Ensure WebSocket is connected
    if (isEligible) {
      useRealtimeStore.getState().connect();
    }
  }, [isEligible]);

  useEffect(() => {
    if (!priceData) return;

    // Determine flash color
    if (priceData.current > priceData.previous) {
      setFlashClass('text-green-500 scale-105 transition-none');
    } else if (priceData.current < priceData.previous) {
      setFlashClass('text-red-500 scale-105 transition-none');
    }

    // Reset flash after 500ms
    const timer = setTimeout(() => {
      setFlashClass('transition-all duration-500 scale-100');
    }, 500);

    return () => clearTimeout(timer);
  }, [priceData]);

  const formatPrice = (price: number) => {
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price > 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const currentPrice = priceData ? priceData.current : initialPrice;

  return (
    <span className={cn("inline-block transform", flashClass, className)}>
      ${formatPrice(currentPrice)}
    </span>
  );
}
