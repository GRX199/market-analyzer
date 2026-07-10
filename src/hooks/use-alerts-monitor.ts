'use client';

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { MarketType } from '@/types/market';

export function useAlertsMonitor() {
  const { alerts, telegramChatId, markAlertTriggered } = useUserStore();
  const prices = useRealtimeStore((state) => state.prices);
  
  // Keep track of which alerts have already fired in this session
  // to avoid sending duplicate requests before state updates
  const triggeredInSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Request browser notification permission if not granted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (!prices || alerts.length === 0) return;

    alerts.filter(a => a.isActive && !a.isTriggered).forEach(alert => {
      // Don't re-trigger if we just triggered it this session but state hasn't propagated
      if (triggeredInSession.current.has(alert.id)) return;

      let streamSymbol = alert.symbol;
      if (alert.marketType === 'crypto') {
        streamSymbol = alert.symbol.replace('/', '').toUpperCase();
      }

      const currentPriceData = prices[streamSymbol];
      if (!currentPriceData) return;

      const currentPrice = currentPriceData.current;
      let shouldTrigger = false;

      if (alert.alertType === 'price_above' && alert.targetValue !== null) {
        if (currentPrice >= alert.targetValue) shouldTrigger = true;
      } else if (alert.alertType === 'price_below' && alert.targetValue !== null) {
        if (currentPrice <= alert.targetValue) shouldTrigger = true;
      }

      if (shouldTrigger) {
        triggeredInSession.current.add(alert.id);
        
        // 1. Mark in store
        markAlertTriggered(alert.id);

        const messageTitle = `🚨 Market Alert: ${alert.symbol}`;
        const messageBody = `Price hit ${currentPrice} (${alert.alertType === 'price_above' ? 'crossed above' : 'crossed below'} ${alert.targetValue})`;

        // 2. Fire Browser Notification
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(messageTitle, {
              body: messageBody,
              icon: '/icon.png', // Assume we have an icon
            });
          }
        }

        // 3. Fire Telegram Notification
        if (telegramChatId) {
          const telegramMessage = `🚨 *MARKET ALERT* 🚨\n\n*Asset:* ${alert.symbol}\n*Price:* ${currentPrice}\n*Condition:* ${alert.alertType === 'price_above' ? 'Crossed Above' : 'Crossed Below'} ${alert.targetValue}\n\n_Market Analyzer Real-time_`;
          
          fetch('/api/notify/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: telegramChatId,
              message: telegramMessage,
            }),
          }).catch(err => console.error('Failed to send Telegram alert:', err));
        }
      }
    });
  }, [prices, alerts, telegramChatId, markAlertTriggered]);
}
