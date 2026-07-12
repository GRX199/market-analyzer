'use client';

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRealtimeStore } from '@/stores/realtime-store';

export function AlertWatcher() {
  const { alerts, markAlertTriggered, telegramChatId } = useUserStore();
  const { prices } = useRealtimeStore();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    const checkAlerts = async () => {
      const activeAlerts = alerts.filter(a => a.isActive && !a.isTriggered);
      
      for (const alert of activeAlerts) {
        // For crypto, symbols in prices don't have '/' (e.g. BTCUSDT)
        // For others it matches exactly
        const streamSymbol = alert.marketType === 'crypto' 
          ? alert.symbol.replace('/', '').toUpperCase()
          : alert.symbol;
          
        const priceData = prices[streamSymbol];
        
        if (priceData && alert.targetValue !== null) {
          let triggered = false;
          
          if (alert.alertType === 'price_above' && priceData.current >= alert.targetValue) {
            triggered = true;
          } else if (alert.alertType === 'price_below' && priceData.current <= alert.targetValue) {
            triggered = true;
          }

          if (triggered) {
            // 1. Mark as triggered in local store so it doesn't fire repeatedly
            markAlertTriggered(alert.id);
            
            // 2. Browser Notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('Market Analyzer Alert', {
                body: `${alert.symbol} crossed your target of ${alert.targetValue}! Current: ${priceData.current}`,
                icon: '/icon.png'
              });
            }

            // 3. Telegram Notification
            if (telegramChatId) {
              try {
                const message = `🚨 *MARKET ALERT* 🚨\n\n*Symbol:* ${alert.symbol}\n*Condition:* ${alert.alertType === 'price_above' ? 'Above' : 'Below'} ${alert.targetValue}\n*Current Price:* ${priceData.current}\n\n_Market Analyzer Web_`;
                
                await fetch('/api/notify/telegram', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId: telegramChatId, message }),
                });
              } catch (err) {
                console.error('Failed to send telegram alert in background', err);
              }
            }
          }
        }
      }
      
      checkingRef.current = false;
    };

    checkAlerts();
  }, [prices, alerts, markAlertTriggered, telegramChatId]);

  return null; // This component doesn't render anything
}
