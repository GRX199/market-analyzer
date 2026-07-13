import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    // Optional: Validate Vercel Cron Secret
    // const authHeader = request.headers.get('authorization');
    // if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    console.log('Running Cron Job: Checking Alerts...');

    // 1. Fetch active alerts with their user's telegram_chat_id
    const { data: activeAlerts, error } = await supabaseAdmin
      .from('alerts')
      .select('*, users (telegram_chat_id)')
      .eq('is_active', true)
      .eq('is_triggered', false);

    if (error) {
      throw error;
    }

    if (!activeAlerts || activeAlerts.length === 0) {
      return NextResponse.json({ success: true, message: 'No active alerts to check.' });
    }
    
    // Group symbols by market type
    const cryptoSymbols = activeAlerts.filter(a => a.market_type === 'crypto').map(a => a.symbol);
    const stockSymbols = activeAlerts.filter(a => a.market_type === 'stocks').map(a => a.symbol);
    const forexSymbols = activeAlerts.filter(a => a.market_type === 'forex').map(a => a.symbol);

    const prices: Record<string, number> = {};

    // Fetch Crypto Prices from Binance (miniTicker)
    if (cryptoSymbols.length > 0) {
      try {
        const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price');
        const binanceData = await binanceRes.json();
        binanceData.forEach((item: any) => {
          prices[item.symbol] = parseFloat(item.price);
        });
      } catch (err) {
        console.error('Failed to fetch Binance prices for cron', err);
      }
    }

    // Fetch Stocks & Forex Prices from Finnhub if API key is present
    const finnhubKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (finnhubKey && (stockSymbols.length > 0 || forexSymbols.length > 0)) {
      const symbolsToFetch = [...stockSymbols, ...forexSymbols];
      // Note: Finnhub REST API requires individual calls for quotes, or bulk endpoints if paid.
      // We will do parallel individual calls for free tier (be careful of rate limits: 60/min)
      await Promise.all(symbolsToFetch.map(async (sym) => {
        try {
          const formattedSym = sym.includes('/') ? `OANDA:${sym.replace('/', '_')}` : sym;
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${formattedSym}&token=${finnhubKey}`);
          const data = await res.json();
          if (data && data.c) {
            prices[sym] = parseFloat(data.c);
          }
        } catch (err) {
          console.error(`Failed to fetch Finnhub price for ${sym}`, err);
        }
      }));
    }

    const triggeredAlerts = [];

    // Evaluate Alerts
    for (const alert of activeAlerts) {
      const streamSymbol = alert.market_type === 'crypto' 
        ? alert.symbol.replace('/', '').toUpperCase() 
        : alert.symbol;
        
      const currentPrice = prices[streamSymbol];
      
      if (currentPrice && alert.target_value !== null) {
        let isTriggered = false;
        
        if (alert.alert_type === 'price_above' && currentPrice >= alert.target_value) {
          isTriggered = true;
        } else if (alert.alert_type === 'price_below' && currentPrice <= alert.target_value) {
          isTriggered = true;
        }

        if (isTriggered) {
          triggeredAlerts.push({ ...alert, currentPrice });
        }
      }
    }

    // Send Telegram Notifications and Update Supabase
    for (const alert of triggeredAlerts) {
      try {
        // Send to Telegram
        const message = `🚨 *BACKGROUND ALERT* 🚨\n\n*Symbol:* ${alert.symbol}\n*Condition:* ${alert.alert_type === 'price_above' ? 'Above' : 'Below'} ${alert.target_value}\n*Current Price:* ${alert.currentPrice}\n\n_Market Analyzer Web_`;
        
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = alert.users?.telegram_chat_id;

        if (botToken && telegramChatId) {
           await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: telegramChatId, text: message, parse_mode: 'Markdown' }),
          });
        }

        // Update in Supabase
        await supabaseAdmin.from('alerts').update({  
          is_active: false, 
          is_triggered: true, 
          triggered_at: new Date().toISOString(),
          trigger_count: alert.trigger_count + 1
        }).eq('id', alert.id);

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
