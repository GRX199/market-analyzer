import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getOHLCV, getAssetPrice } from '@/services/market-data';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { calculateFinalScore } from '@/lib/analysis/scoring';
import { FundamentalAnalysis, SentimentAnalysis } from '@/types/analysis';

export async function GET(request: Request) {
  try {
    // Optional: Validate Vercel Cron Secret
    // const authHeader = request.headers.get('authorization');
    // if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

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

    const activeAlerts = alertsRes.data || [];
    const watchlists = watchlistsRes.data || [];

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
              triggerMessage = `Sinyal ${alert.symbol} di timeframe ${alert.timeframe} telah berubah menjadi *${final.signal.toUpperCase().replace('_', ' ')}*!`;
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
            triggerMessage = `Harga ${alert.symbol} telah NAIK menembus batas *${alert.target_value}* (Harga Saat Ini: ${currentPrice})`;
          } else if (alert.alert_type === 'price_below' && currentPrice <= alert.target_value) {
            isTriggered = true;
            triggerMessage = `Harga ${alert.symbol} telah TURUN menembus batas *${alert.target_value}* (Harga Saat Ini: ${currentPrice})`;
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
            
            const triggerMessage = `🤖 *AUTO-SCANNER ALERT*\n\nSinyal ${item.symbol} di timeframe ${item.timeframe} baru saja berubah menjadi *${currentSignal.toUpperCase().replace('_', ' ')}*!`;
            triggeredAlerts.push({ 
              id: item.id,
              isWatchlist: true,
              symbol: item.symbol,
              triggerMessage,
              users: item.users,
              newSignal: currentSignal
            });
          }
        }
      } catch (err) {
        console.error(`Failed to evaluate watchlist scanner for ${item.symbol}`, err);
      }
    }

    // Send Telegram Notifications and Update Supabase
    for (const alert of triggeredAlerts) {
      try {
        // Send to Telegram
        const message = `🚨 *MARKET ALERT* 🚨\n\n${alert.triggerMessage}\n\n_Market Analyzer Web_`;
        
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = alert.users?.telegram_chat_id;

        if (botToken && telegramChatId) {
           await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: telegramChatId, text: message, parse_mode: 'Markdown' }),
          });
        }

        if (alert.isWatchlist) {
          // Update last_signal in watchlists
          await supabaseAdmin.from('watchlists').update({ 
            last_signal: alert.newSignal
          }).eq('id', alert.id);
        } else {
          // Update in alerts
          await supabaseAdmin.from('alerts').update({ 
            is_active: false, 
            is_triggered: true, 
            triggered_at: new Date().toISOString(),
            trigger_count: alert.trigger_count + 1
          }).eq('id', alert.id);
        }

      } catch (err) {
        console.error('Failed to process triggered alert', alert.id, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      checked: activeAlerts.length, 
      triggered: triggeredAlerts.length 
    });

  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
