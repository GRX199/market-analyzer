import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getOHLCV, getAssetPrice } from '@/services/market-data';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { calculateFinalScore } from '@/lib/analysis/scoring';
import { FundamentalAnalysis, SentimentAnalysis } from '@/types/analysis';
import { authorizeBearerRequest } from '@/lib/trading/http';
import {
  NotificationDeliveryError,
  settleClaimedNotification,
} from '@/lib/alerts/cron-delivery';
import {
  isSafeConfiguredSecret,
  isTelegramChatAuthorized,
  isTradingUserAuthorized,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authorization = authorizeBearerRequest(request, [
    process.env.CRON_SECRET,
  ]);
  if (!authorization.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: authorization.misconfigured
          ? 'Cron authentication is not configured'
          : 'Unauthorized',
      },
      {
        status: authorization.misconfigured ? 503 : 401,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdminClient();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cron database access is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    console.log('Running Cron Job: Checking Alerts...');

    // 1. Fetch active alerts and watchlists with their user's telegram_chat_id
    const [alertsRes, watchlistsRes] = await Promise.all([
      supabaseAdmin
        .from('alerts')
        .select('*, users (telegram_chat_id)')
        .eq('is_active', true)
        .eq('is_triggered', false),
      supabaseAdmin
        .from('watchlists')
        .select('*, users (telegram_chat_id)')
    ]);

    if (alertsRes.error) throw alertsRes.error;
    if (watchlistsRes.error) throw watchlistsRes.error;

    const activeAlerts = (alertsRes.data || []).filter((alert) => (
      typeof alert.user_id === 'string'
      && isTradingUserAuthorized(
        alert.user_id,
        process.env.TELEGRAM_ALLOWED_USER_IDS
      )
    ));
    const watchlists = (watchlistsRes.data || []).filter((item) => (
      typeof item.user_id === 'string'
      && isTradingUserAuthorized(
        item.user_id,
        process.env.TELEGRAM_ALLOWED_USER_IDS
      )
    ));

    if (activeAlerts.length === 0 && watchlists.length === 0) {
      return NextResponse.json({ success: true, message: 'No active alerts to check.' });
    }
    
    // Group symbols by market type
    const prices: Record<string, number> = {};

    // Get unique symbols for price-based alerts
    const priceAlertSymbols = activeAlerts
      .filter(a => a.alert_type === 'price_above' || a.alert_type === 'price_below')
      .map(a => a.symbol);

    // Fetch prices using the new Yahoo API service wrapper
    if (priceAlertSymbols.length > 0) {
      await Promise.all(priceAlertSymbols.map(async (sym) => {
        try {
          const assetData = await getAssetPrice(sym);
          if (assetData) {
            prices[sym] = assetData.price;
          }
        } catch (err) {
          console.error(`Failed to fetch price for ${sym}`, err);
        }
      }));
    }

    const triggeredAlerts = [];

    // Evaluate Alerts
    for (const alert of activeAlerts) {
      let isTriggered = false;
      let triggerMessage = '';

      if (alert.alert_type === 'signal_change' && alert.timeframe && alert.target_signal) {
        // --- SIGNAL ALERT LOGIC ---
        try {
          const ohlcv = await getOHLCV(alert.symbol, alert.timeframe);
          if (ohlcv.length > 0) {
            const currentPrice = ohlcv[ohlcv.length - 1].close;
            const technical = calculateTechnicalScore(ohlcv);
            
            // Mock fundamental and sentiment for cron
            const mockFund: FundamentalAnalysis = { marketType: alert.market_type as any, data: {} as any, score: 50, reasons: [] };
            const mockSent: SentimentAnalysis = { overallSentiment: 'neutral', newsScore: 50, socialScore: 50, score: 50, reasons: [] };
            
            const final = calculateFinalScore(alert.symbol, alert.market_type as any, currentPrice, technical, mockFund, mockSent);
            
            if (final.signal === alert.target_signal) {
              isTriggered = true;
              triggerMessage = `Sinyal ${alert.symbol} di timeframe ${alert.timeframe} telah berubah menjadi ${final.signal.toUpperCase().replace('_', ' ')}!`;
            }
          }
        } catch (err) {
          console.error(`Failed to evaluate signal alert for ${alert.symbol}`, err);
        }
      } else {
        // --- PRICE ALERT LOGIC ---
        const currentPrice = prices[alert.symbol];

        if (currentPrice && alert.target_value !== null) {
          if (alert.alert_type === 'price_above' && currentPrice >= alert.target_value) {
            isTriggered = true;
            triggerMessage = `Harga ${alert.symbol} telah NAIK menembus batas ${alert.target_value} (Harga Saat Ini: ${currentPrice})`;
          } else if (alert.alert_type === 'price_below' && currentPrice <= alert.target_value) {
            isTriggered = true;
            triggerMessage = `Harga ${alert.symbol} telah TURUN menembus batas ${alert.target_value} (Harga Saat Ini: ${currentPrice})`;
          }
        }
      }

      if (isTriggered) {
        triggeredAlerts.push({ ...alert, triggerMessage });
      }
    }

    // Evaluate Watchlists (Auto-Scanner)
    for (const item of watchlists) {
      if (!item.timeframe) continue;

      try {
        const ohlcv = await getOHLCV(item.symbol, item.timeframe);
        if (ohlcv.length > 0) {
          const currentPrice = ohlcv[ohlcv.length - 1].close;
          const technical = calculateTechnicalScore(ohlcv);
          
          const mockFund: FundamentalAnalysis = { marketType: item.market_type as any, data: {} as any, score: 50, reasons: [] };
          const mockSent: SentimentAnalysis = { overallSentiment: 'neutral', newsScore: 50, socialScore: 50, score: 50, reasons: [] };
          
          const final = calculateFinalScore(item.symbol, item.market_type as any, currentPrice, technical, mockFund, mockSent);
          
          const currentSignal = final.signal; // e.g., 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'

          // Only alert if it's a STRONG signal and it's DIFFERENT from the last alerted signal
          if ((currentSignal === 'strong_buy' || currentSignal === 'strong_sell') && currentSignal !== item.last_signal) {
            
            const triggerMessage = `🤖 AUTO-SCANNER ALERT\n\nSinyal ${item.symbol} di timeframe ${item.timeframe} baru saja berubah menjadi ${currentSignal.toUpperCase().replace('_', ' ')}!`;
            triggeredAlerts.push({ 
              id: item.id,
              isWatchlist: true,
              symbol: item.symbol,
              triggerMessage,
              users: item.users,
              newSignal: currentSignal,
              lastSignal: item.last_signal,
              lastScannerClaimVersion: item.scanner_claim_version,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to evaluate watchlist scanner for ${item.symbol}`, err);
      }
    }

    // Atomically claim each state transition before notifying. Concurrent cron
    // invocations can evaluate the same snapshot, but only one is allowed to
    // change each row and send its notification.
    let processedAlerts = 0;
    for (const alert of triggeredAlerts) {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = alert.users?.telegram_chat_id;
        const hasSafeBotToken = isSafeConfiguredSecret(botToken);
        const hasAuthorizedDestination =
          typeof telegramChatId === 'string'
          && isTelegramChatAuthorized(
            telegramChatId,
            process.env.TELEGRAM_ALLOWED_CHAT_IDS
          );

        // A background cron has no browser channel to fall back to. Leave the
        // row untouched when Telegram delivery is unavailable so a later run
        // can retry after configuration is repaired.
        if (!hasSafeBotToken || !hasAuthorizedDestination) {
          console.warn('Telegram cron delivery unavailable; alert left active', {
            alertId: alert.id,
            botConfigured: hasSafeBotToken,
            destinationAuthorized: hasAuthorizedDestination,
          });
          continue;
        }

        let claimedId: string | null = null;
        let rollbackClaim: (() => Promise<boolean>) | null = null;
        if (alert.isWatchlist) {
          const claimedSignal = String(alert.newSignal);
          const previousClaimVersion =
            typeof alert.lastScannerClaimVersion === 'string'
              ? alert.lastScannerClaimVersion
              : null;
          if (!previousClaimVersion) {
            console.error('Watchlist scanner claim version is missing', {
              watchlistId: alert.id,
            });
            continue;
          }
          const claimedVersion = randomUUID();
          let claimQuery = supabaseAdmin
            .from('watchlists')
            .update({
              last_signal: claimedSignal,
              scanner_claim_version: claimedVersion,
            })
            .eq('id', alert.id)
            .eq('scanner_claim_version', previousClaimVersion);
          const lastSignal = typeof alert.lastSignal === 'string'
            ? alert.lastSignal
            : null;

          claimQuery = lastSignal === null
            ? claimQuery.is('last_signal', null)
            : claimQuery.eq('last_signal', lastSignal);

          const { data: claimed, error: claimError } = await claimQuery
            .select('id')
            .maybeSingle();
          if (claimError) throw claimError;
          claimedId = claimed?.id ?? null;

          rollbackClaim = async () => {
            const { data: rolledBack, error: rollbackError } = await supabaseAdmin
              .from('watchlists')
              .update({
                last_signal: lastSignal,
                scanner_claim_version: previousClaimVersion,
              })
              .eq('id', alert.id)
              // The random version closes the A -> B -> A rollback hole.
              .eq('scanner_claim_version', claimedVersion)
              .eq('last_signal', claimedSignal)
              .select('id')
              .maybeSingle();
            if (rollbackError) throw rollbackError;
            return Boolean(rolledBack?.id);
          };
        } else {
          const previousTriggerCountValue = Number(alert.trigger_count ?? 0);
          const previousTriggerCount = Number.isFinite(previousTriggerCountValue)
            ? previousTriggerCountValue
            : 0;
          const claimedTriggerCount = previousTriggerCount + 1;
          const claimedAt = new Date().toISOString();
          const previousTriggeredAt = typeof alert.triggered_at === 'string'
            ? alert.triggered_at
            : null;

          const { data: claimed, error: claimError } = await supabaseAdmin
            .from('alerts')
            .update({
              is_active: false,
              is_triggered: true,
              triggered_at: claimedAt,
              trigger_count: claimedTriggerCount,
            })
            .eq('id', alert.id)
            .eq('is_active', true)
            .eq('is_triggered', false)
            .select('id')
            .maybeSingle();
          if (claimError) throw claimError;
          claimedId = claimed?.id ?? null;

          rollbackClaim = async () => {
            const { data: rolledBack, error: rollbackError } = await supabaseAdmin
              .from('alerts')
              .update({
                is_active: true,
                is_triggered: false,
                triggered_at: previousTriggeredAt,
                trigger_count: previousTriggerCount,
              })
              .eq('id', alert.id)
              // claimedAt is a per-invocation fencing token. These comparisons
              // prevent a failed sender from reverting a newer state.
              .eq('is_active', false)
              .eq('is_triggered', true)
              .eq('triggered_at', claimedAt)
              .eq('trigger_count', claimedTriggerCount)
              .select('id')
              .maybeSingle();
            if (rollbackError) throw rollbackError;
            return Boolean(rolledBack?.id);
          };
        }

        if (!claimedId || !rollbackClaim) continue;

        // Send to Telegram
        const message = `🚨 MARKET ALERT 🚨\n\n${alert.triggerMessage}\n\nMarket Analyzer Web`;

        const deliveryResult = await settleClaimedNotification({
          send: () => fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: telegramChatId,
                text: message,
              }),
              signal: AbortSignal.timeout(10_000),
            }
          ),
          rollback: rollbackClaim,
        });

        if (!deliveryResult.processed) {
          console.error('Telegram cron notification failed; claim rollback attempted', {
            alertId: claimedId,
            status: deliveryResult.sendError instanceof NotificationDeliveryError
              ? deliveryResult.sendError.status
              : 'network_error',
            rollbackApplied: deliveryResult.rollbackApplied,
            rollbackFailed: Boolean(deliveryResult.rollbackError),
          });
          continue;
        }

        // Cron only processes a claim after Telegram confirms delivery.
        processedAlerts += 1;
      } catch (err) {
        console.error('Failed to process triggered alert', alert.id, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      checked: activeAlerts.length, 
      triggered: processedAlerts,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (error: unknown) {
    console.error('Cron execution failed', error);
    return NextResponse.json(
      { success: false, error: 'Cron execution failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
