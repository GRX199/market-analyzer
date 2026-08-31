'use client';

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRealtimeStore } from '@/stores/realtime-store';
import { toast } from 'sonner';

interface TriggerResult {
  claimed: boolean;
  conditionMet: boolean;
  telegramDelivered: boolean;
  alert?: {
    id: string;
    isActive: boolean;
    isTriggered: boolean;
    triggeredAt: string | null;
    triggerCount: number;
  };
}

function asTriggerResult(value: unknown): TriggerResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.claimed !== 'boolean'
    || typeof row.conditionMet !== 'boolean'
  ) {
    return null;
  }

  const alert = typeof row.alert === 'object' && row.alert !== null
    ? row.alert as Record<string, unknown>
    : undefined;
  const parsedAlert = alert
    && typeof alert.id === 'string'
    && typeof alert.isActive === 'boolean'
    && typeof alert.isTriggered === 'boolean'
    && (alert.triggeredAt === null || typeof alert.triggeredAt === 'string')
    && typeof alert.triggerCount === 'number'
    && Number.isInteger(alert.triggerCount)
      ? {
          id: alert.id,
          isActive: alert.isActive,
          isTriggered: alert.isTriggered,
          triggeredAt: alert.triggeredAt,
          triggerCount: alert.triggerCount,
        }
      : undefined;

  return {
    claimed: row.claimed,
    conditionMet: row.conditionMet,
    telegramDelivered: row.telegramDelivered === true,
    alert: parsedAlert,
  };
}

async function triggerAlert(
  alertId: string,
  observedPrice: number,
): Promise<TriggerResult> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ observedPrice }),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof payload === 'object'
      && payload !== null
      && 'error' in payload
      && typeof payload.error === 'string'
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  const result = asTriggerResult(payload);
  if (!result) throw new Error('Server mengembalikan hasil trigger alert yang tidak valid.');
  return result;
}

function notifyBrowser(symbol: string, price: number, comparison: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(`🚨 Market Alert: ${symbol}`, {
      body: `Price hit ${price} (${comparison})`,
      icon: '/icon.png',
    });
  } catch (error) {
    console.error('Browser notification failed:', error);
  }
}

export function useAlertsMonitor() {
  const alerts = useUserStore((state) => state.alerts);
  const markAlertTriggered = useUserStore((state) => state.markAlertTriggered);
  const prices = useRealtimeStore((state) => state.prices);
  const triggeredInSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (alerts.length === 0) return;

    alerts.filter(a => a.isActive && !a.isTriggered).forEach(alert => {
      if (triggeredInSession.current.has(alert.id)) return;
      if (
        alert.targetValue === null
        || (alert.alertType !== 'price_above' && alert.alertType !== 'price_below')
      ) {
        return;
      }

      const normalizedSymbol = alert.marketType === 'crypto'
        ? alert.symbol.replace('/', '').toUpperCase()
        : alert.symbol.toUpperCase();

      const currentPriceData = prices[normalizedSymbol] ?? prices[alert.symbol];
      if (!currentPriceData) return;

      const currentPrice = currentPriceData.current;
      const shouldTrigger = alert.alertType === 'price_above'
        ? currentPrice >= alert.targetValue
        : currentPrice <= alert.targetValue;

      if (shouldTrigger) {
        triggeredInSession.current.add(alert.id);
        void triggerAlert(alert.id, currentPrice)
          .then((result) => {
            if (!result.conditionMet) {
              // A browser tick can be stale or come from another provider.
              // Do not consume the alert until the server agrees.
              triggeredInSession.current.delete(alert.id);
              return;
            }

            if (result.alert?.isTriggered) {
              markAlertTriggered(
                alert.id,
                result.alert.triggeredAt,
                result.alert.triggerCount,
              );
            }

            if (!result.claimed) return;

            const comparison = alert.alertType === 'price_above'
              ? `crossed above ${alert.targetValue}`
              : `crossed below ${alert.targetValue}`;
            notifyBrowser(alert.symbol, currentPrice, comparison);
            toast.success(
              result.telegramDelivered
                ? `Alert ${alert.symbol} dipicu dan Telegram terkirim.`
                : `Alert ${alert.symbol} dipicu.`,
              { id: `market-alert-${alert.id}` },
            );
          })
          .catch((error: unknown) => {
            // Do not persist or suppress an alert when the authoritative
            // server path failed; the next live price update may retry it.
            triggeredInSession.current.delete(alert.id);
            const description = error instanceof Error
              ? error.message
              : 'Kesalahan yang tidak diketahui.';
            console.error('Failed to trigger alert:', error);
            toast.error(`Alert ${alert.symbol} gagal diproses`, {
              id: `market-alert-error-${alert.id}`,
              description,
            });
          });
      }
    });
  }, [prices, alerts, markAlertTriggered]);
}
