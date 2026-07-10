import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  // Parse requested symbols (e.g., "EUR/USD,GBP/USD")
  const requestedSymbols = symbolsParam.split(',');

  try {
    const parsedPrices: Record<string, number> = {};

    // Fetch all sequentially or parallel (Google Finance is fast)
    await Promise.all(
      requestedSymbols.map(async (sym) => {
        if (!sym.includes('/')) return;
        
        // Convert "EUR/USD" to "EUR-USD"
        const gfSymbol = sym.replace('/', '-');
        const url = `https://www.google.com/finance/quote/${gfSymbol}`;
        
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            cache: 'no-store'
          });

          if (response.ok) {
            const html = await response.text();
            // Regex to find the main price div in Google Finance
            const match = html.match(/class="YMlKec fxKbKc">([^<]+)<\/div>/);
            if (match && match[1]) {
              // Parse "1,0823" or "1.0823"
              const priceStr = match[1].replace(/,/g, '');
              const price = parseFloat(priceStr);
              if (!isNaN(price)) {
                parsedPrices[sym] = price;
              }
            }
          }
        } catch (err) {
          // Ignore individual fetch errors
        }
      })
    );

    return NextResponse.json(parsedPrices);

  } catch (error: any) {
    console.error('Forex Proxy Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch forex data' }, { status: 500 });
  }
}
