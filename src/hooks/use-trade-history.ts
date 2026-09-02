'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueuedTradeHistoryItem {
  id: string;
  symbol: string;
  marketType: string;
  action: 'buy' | 'sell';
  volume: number;
  executedVolume: number | null;
  status: string;
  idempotencyKey: string;
  attempts: number;
  createdAt: string;
  claimedAt: string | null;
  executedAt: string | null;
  executionPrice: number | null;
  brokerOrderTicket: string | null;
  errorMessage: string | null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseHistoryItem(value: unknown): QueuedTradeHistoryItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const volume = Number(row.volume);
  const attempts = Number(row.attempts);
  const executedVolume = row.executed_volume === null
    || row.executed_volume === undefined
    ? null
    : Number(row.executed_volume);
  const executionPrice = row.execution_price === null
    ? null
    : Number(row.execution_price);

  if (
    typeof row.id !== 'string'
    || typeof row.symbol !== 'string'
    || typeof row.market_type !== 'string'
    || (row.action !== 'buy' && row.action !== 'sell')
    || typeof row.status !== 'string'
    || typeof row.idempotency_key !== 'string'
    || typeof row.created_at !== 'string'
    || !Number.isFinite(volume)
    || (executedVolume !== null && !Number.isFinite(executedVolume))
    || !Number.isInteger(attempts)
    || (executionPrice !== null && !Number.isFinite(executionPrice))
  ) {
    return null;
  }

  return {
    id: row.id,
    symbol: row.symbol,
    marketType: row.market_type,
    action: row.action,
    volume,
    executedVolume,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attempts,
    createdAt: row.created_at,
    claimedAt: nullableString(row.claimed_at),
    executedAt: nullableString(row.executed_at),
    executionPrice,
    brokerOrderTicket: nullableString(row.broker_order_ticket),
    errorMessage: nullableString(row.error_message),
  };
}

export function useTradeHistory(enabled: boolean) {
  const [trades, setTrades] = useState<QueuedTradeHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setTrades([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setLoading(true);

    try {
      const response = await fetch('/api/trades?limit=10', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abortController.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      const row = typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        throw new Error(
          typeof row.error === 'string' ? row.error : `HTTP ${response.status}`,
        );
      }
      if (!Array.isArray(row.trades)) {
        throw new Error('Server mengembalikan riwayat antrean yang tidak valid.');
      }

      const parsed = row.trades
        .map(parseHistoryItem)
        .filter((trade): trade is QueuedTradeHistoryItem => trade !== null);
      if (requestSequenceRef.current === requestSequence) {
        setTrades(parsed);
        setError(null);
      }
    } catch (caughtError) {
      if (
        !abortController.signal.aborted
        && requestSequenceRef.current === requestSequence
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Riwayat antrean gagal dimuat.',
        );
      }
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    // Defer the first refresh to an external task. Calling refresh directly
    // here would synchronously set loading state from the effect body.
    const initialRefreshTimer = globalThis.setTimeout(() => {
      void refresh();
    }, 0);
    if (!enabled) {
      return () => globalThis.clearTimeout(initialRefreshTimer);
    }

    const intervalId = globalThis.setInterval(() => {
      void refresh();
    }, 15_000);
    const handleRuntimeRefresh = () => void refresh();
    window.addEventListener('auto-trade-history-refresh', handleRuntimeRefresh);
    return () => {
      globalThis.clearTimeout(initialRefreshTimer);
      globalThis.clearInterval(intervalId);
      window.removeEventListener('auto-trade-history-refresh', handleRuntimeRefresh);
      requestSequenceRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, refresh]);

  return {
    trades,
    loading,
    error,
    refresh,
  };
}
