'use client';

import { useEffect, useState } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { cn } from '@/lib/utils';
import { MarketType } from '@/types/market';

interface RealtimePriceProps {
  symbol: string;         // e.g. "BTC/USDT" or "AAPL" or "EUR/USD"
  marketType: MarketType; // e.g. "crypto" | "stocks" | "forex"
  initialPrice: number;
  className?: string;
}

export function RealtimePrice({ symbol, marketType, initialPrice, className }: RealtimePriceProps) {
  // Format the symbol based on market type
  const getStreamSymbol = (sym: string, type: MarketType) => {
    if (type === 'crypto') return sym.replace('/', '').toUpperCase(); // BTC/USDT -> BTCUSDT
    return sym; // Stocks (AAPL) and Forex (EUR/USD) keep original names for matching
  };

  const streamSymbol = getStreamSymbol(symbol, marketType);

  // Get price data specifically for this symbol
  const priceData = useRealtimeStore((state) => state.prices[streamSymbol]);

  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    const store = useRealtimeStore.getState();
    
    // Connect to streams if not connected
    if (marketType === 'crypto') store.connectCrypto();
    if (marketType === 'stocks') {
      const finnhubKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
      if (finnhubKey) store.connectStocks(finnhubKey);
    }
    if (marketType === 'forex') store.startForexPolling();

    // Subscribe this symbol
    store.subscribeSymbol(streamSymbol, marketType);

    // Unsubscribe on unmount
    return () => {
      store.unsubscribeSymbol(streamSymbol, marketType);
    };
  }, [streamSymbol, marketType]);

  useEffect(() => {
    if (!priceData) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (priceData.current > priceData.previous) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlashClass('text-green-500 scale-105 transition-none');
    } else if (priceData.current < priceData.previous) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
