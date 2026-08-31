'use client';

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useMarketStore } from '@/stores/market-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { supabase } from '@/lib/supabase/client';
import { useAlertsMonitor } from '@/hooks/use-alerts-monitor';
import { Toaster } from '@/components/ui/sonner';
import { usePathname } from 'next/navigation';

export function AlertWatcher() {
  const loadFromSupabase = useUserStore((state) => state.loadFromSupabase);
  const alerts = useUserStore((state) => state.alerts);
  const observedUserIdRef = useRef<string | null | undefined>(undefined);
  const pathname = usePathname();

  // The root-level watcher is the single alert monitor for the whole application.
  useAlertsMonitor();

  useEffect(() => {
    // The login page does not need account-data hydration or an auth watcher.
    // After a successful login the pathname changes and this effect starts the
    // protected-workspace bootstrap.
    if (pathname === '/login') return undefined;

    let isActive = true;
    let unsubscribeAuth: (() => void) | undefined;

    const initialize = async () => {
      await Promise.allSettled([
        useUserStore.persist.rehydrate(),
        useMarketStore.persist.rehydrate(),
      ]);

      if (!isActive) return;
      // Persisted account data is not an authentication source. Keep account
      // pages gated until Supabase confirms the current session and reloads
      // data for that exact user. Preserve only the cached account identifier
      // so loadFromSupabase can distinguish a reload from a real account
      // switch without discarding account-bound local history.
      useUserStore.setState({
        isAuthenticated: false,
        isAccountLoading: true,
        accountLoadError: null,
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          const nextUserId = session?.user.id ?? null;
          const userChanged = observedUserIdRef.current !== nextUserId;
          observedUserIdRef.current = nextUserId;

          if (
            event === 'INITIAL_SESSION'
            || event === 'SIGNED_OUT'
            || event === 'USER_UPDATED'
            || userChanged
          ) {
            queueMicrotask(() => {
              if (isActive) void loadFromSupabase();
            });
          }
        },
      );

      unsubscribeAuth = () => subscription.unsubscribe();
    };

    void initialize();

    return () => {
      isActive = false;
      unsubscribeAuth?.();
    };
  }, [loadFromSupabase, pathname]);

  useEffect(() => {
    const subscriptions = new Map<
      string,
      { symbol: string; marketType: 'crypto' | 'stocks' | 'forex' }
    >();

    for (const alert of alerts) {
      if (
        !alert.isActive
        || alert.isTriggered
        || (alert.alertType !== 'price_above' && alert.alertType !== 'price_below')
      ) {
        continue;
      }

      const symbol = alert.marketType === 'crypto'
        ? alert.symbol.replace('/', '').toUpperCase()
        : alert.symbol.toUpperCase();
      subscriptions.set(`${alert.marketType}:${symbol}`, {
        symbol,
        marketType: alert.marketType,
      });
    }

    if (subscriptions.size === 0) return undefined;

    const realtime = useRealtimeStore.getState();
    if ([...subscriptions.values()].some(({ marketType }) => marketType === 'crypto')) {
      realtime.connectCrypto();
    }
    if ([...subscriptions.values()].some(({ marketType }) => marketType === 'stocks')) {
      const finnhubKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
      if (finnhubKey) realtime.connectStocks(finnhubKey);
    }
    if ([...subscriptions.values()].some(({ marketType }) => marketType === 'forex')) {
      realtime.startForexPolling();
    }

    for (const { symbol, marketType } of subscriptions.values()) {
      realtime.subscribeSymbol(symbol, marketType);
    }

    return () => {
      const currentRealtime = useRealtimeStore.getState();
      for (const { symbol, marketType } of subscriptions.values()) {
        currentRealtime.unsubscribeSymbol(symbol, marketType);
      }
    };
  }, [alerts]);

  return <Toaster position="top-right" richColors closeButton />;
}
