import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  // Parse custom format "EUR/USD,GBP/USD" to Yahoo Finance format "EURUSD=X,GBPUSD=X"
  const requestedSymbols = symbolsParam.split(',');
  const yahooSymbols = requestedSymbols.map(sym => {
    // If it contains a slash, assume it's forex
    if (sym.includes('/')) {
      return sym.replace('/', '') + '=X';
    }
    // Fallback for others
    return sym;
  });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbols.join(',')}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 5 } // Cache for 5 seconds to prevent rate limits
    });

    if (!response.ok) {
      throw new Error(`Yahoo API responded with ${response.status}`);
    }

    const data = await response.json();
    const results = data.quoteResponse?.result || [];

    // Map back to our format
    const parsedPrices: Record<string, number> = {};
    
    results.forEach((item: any) => {
      // Find original requested symbol
      let originalSymbol = item.symbol;
      if (item.symbol.endsWith('=X')) {
        const base = item.symbol.replace('=X', '');
        // Hacky way to restore slash for 6-char forex pairs (e.g., EURUSD -> EUR/USD)
        if (base.length === 6) {
          originalSymbol = `${base.substring(0,3)}/${base.substring(3,6)}`;
        }
      }
      
      if (item.regularMarketPrice) {
        parsedPrices[originalSymbol] = item.regularMarketPrice;
      }
    });

    return NextResponse.json(parsedPrices);

  } catch (error: any) {
    console.error('Forex Proxy Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch forex data' }, { status: 500 });
  }
}
