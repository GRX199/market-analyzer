// ============================================================
// Yahoo Finance HTTP Client — Direct fetch, NO npm package needed
// Works perfectly on Vercel serverless, Edge, and local dev
// ============================================================

import { AssetData, OHLCV } from '@/types/market';
import { StockFundamentals, NewsItem } from '@/types/analysis';

const YF_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YF_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YF_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// ==========================================
// SYMBOL MAPPING UTILITIES
// ==========================================

export function mapSymbolToYahoo(symbol: string, marketType: 'stocks' | 'forex' | 'crypto'): string {
  if (marketType === 'forex') {
    return `${symbol.replace('/', '')}=X`;
  }
  if (marketType === 'crypto') {
    return `${symbol.replace('/USDT', '-USD')}`;
  }
  if (marketType === 'stocks') {
    const indonesianStocks = ['BBCA', 'BBRI', 'BMRI', 'ASII', 'TLKM', 'GOTO'];
    if (indonesianStocks.includes(symbol)) {
      return `${symbol}.JK`;
    }
    return symbol;
  }
  return symbol;
}

// ==========================================
// BATCH QUOTE (multiple symbols at once)
// ==========================================

export async function fetchYahooBatchQuotes(
  symbols: { symbol: string; name: string }[],
  marketType: 'stocks' | 'forex' | 'crypto'
): Promise<AssetData[]> {
  try {
    const yahooSymbols = symbols.map(s => mapSymbolToYahoo(s.symbol, marketType));
    const symbolsParam = yahooSymbols.join(',');
    
    const url = `${YF_QUOTE_URL}?symbols=${encodeURIComponent(symbolsParam)}`;
    const res = await fetch(url, { 
      headers: HEADERS, 
      next: { revalidate: 30 } // Cache for 30 seconds
    });
    
    if (!res.ok) {
      console.error(`[Yahoo HTTP] Batch quote failed: ${res.status} ${res.statusText}`);
      return [];
    }
    
    const json = await res.json();
    const quotes = json?.quoteResponse?.result || [];
    
    return symbols.map(s => {
      const ySymbol = mapSymbolToYahoo(s.symbol, marketType);
      const quote = quotes.find((q: any) => q.symbol === ySymbol);
      
      if (!quote) {
        return {
          symbol: s.symbol,
          name: s.name,
          marketType,
          price: 0, previousClose: 0, change: 0, changePercent: 0,
          high24h: 0, low24h: 0, volume: 0, trend: 'sideways' as const,
        };
      }

      const price = quote.regularMarketPrice || 0;
      const previousClose = quote.regularMarketPreviousClose || price;
      const change = quote.regularMarketChange || (price - previousClose);
      const changePercent = quote.regularMarketChangePercent || (previousClose ? (change / previousClose) * 100 : 0);

      return {
        symbol: s.symbol,
        name: s.name,
        marketType,
        price,
        previousClose,
        change,
        changePercent,
        high24h: quote.regularMarketDayHigh || price,
        low24h: quote.regularMarketDayLow || price,
        volume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap || undefined,
        trend: change >= 0 ? 'bullish' as const : 'bearish' as const,
      };
    });
  } catch (error) {
    console.error(`[Yahoo HTTP] Batch quote error:`, error);
    return [];
  }
}

// ==========================================
// SINGLE ASSET PRICE (QUOTE)
// ==========================================

export async function fetchYahooQuote(
  symbol: string,
  name: string,
  marketType: 'stocks' | 'forex' | 'crypto'
): Promise<AssetData | null> {
  try {
    const yahooSymbol = mapSymbolToYahoo(symbol, marketType);
    const url = `${YF_QUOTE_URL}?symbols=${encodeURIComponent(yahooSymbol)}`;
    
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } });
    if (!res.ok) return null;
    
    const json = await res.json();
    const quote = json?.quoteResponse?.result?.[0];
    if (!quote) return null;

    const price = quote.regularMarketPrice || 0;
    const previousClose = quote.regularMarketPreviousClose || price;
    const change = quote.regularMarketChange || (price - previousClose);
    const changePercent = quote.regularMarketChangePercent || ((change / previousClose) * 100);

    return {
      symbol, name, marketType, price, previousClose, change, changePercent,
      high24h: quote.regularMarketDayHigh || price,
      low24h: quote.regularMarketDayLow || price,
      volume: quote.regularMarketVolume || 0,
      marketCap: quote.marketCap || undefined,
      trend: change >= 0 ? 'bullish' : 'bearish',
    };
  } catch (error) {
    console.error(`[Yahoo HTTP] Quote failed for ${symbol}:`, error);
    return null;
  }
}

// ==========================================
// HISTORICAL CHART (OHLCV)
// ==========================================

export async function fetchYahooOHLCV(
  symbol: string,
  marketType: 'stocks' | 'forex' | 'crypto'
): Promise<OHLCV[]> {
  try {
    const yahooSymbol = mapSymbolToYahoo(symbol, marketType);
    const url = `${YF_CHART_URL}/${encodeURIComponent(yahooSymbol)}?range=1y&interval=1d&includePrePost=false`;
    
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
    if (!res.ok) return [];
    
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv) return [];

    const candles: OHLCV[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (ohlcv.open[i] != null && ohlcv.close[i] != null) {
        candles.push({
          time: timestamps[i],
          open: ohlcv.open[i],
          high: ohlcv.high[i],
          low: ohlcv.low[i],
          close: ohlcv.close[i],
          volume: ohlcv.volume?.[i] || 0,
        });
      }
    }
    return candles;
  } catch (error) {
    console.error(`[Yahoo HTTP] OHLCV failed for ${symbol}:`, error);
    return [];
  }
}

// ==========================================
// FUNDAMENTALS (STOCKS ONLY)
// ==========================================

export async function fetchYahooFundamentals(
  symbol: string
): Promise<StockFundamentals | null> {
  try {
    const yahooSymbol = mapSymbolToYahoo(symbol, 'stocks');
    const url = `${YF_QUOTE_URL}?symbols=${encodeURIComponent(yahooSymbol)}`;
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return null;
    
    const json = await res.json();
    const quote = json?.quoteResponse?.result?.[0];
    if (!quote) return null;

    return {
      peRatio: quote.trailingPE || 0,
      pbv: quote.priceToBook || 0,
      eps: quote.epsTrailingTwelveMonths || 0,
      revenueGrowth: 0,
      netProfitMargin: (quote.profitMargins || 0) * 100,
      debtToEquity: 0,
      roe: 0,
      dividendYield: (quote.trailingAnnualDividendYield || 0) * 100,
      marketCap: quote.marketCap || 0,
      quarterlyRevenue: [],
      newsHeadlines: [],
    };
  } catch (error) {
    console.error(`[Yahoo HTTP] Fundamentals failed for ${symbol}:`, error);
    return null;
  }
}

// ==========================================
// NEWS SEARCH
// ==========================================

export async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  try {
    const url = `${YF_SEARCH_URL}?q=${encodeURIComponent(query)}&newsCount=10&enableFuzzyQuery=false&quotesCount=0`;
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 120 } });
    if (!res.ok) return [];
    
    const json = await res.json();
    const news = json?.news || [];

    return news.map((item: any, index: number) => ({
      id: item.uuid || `yahoo-${index}`,
      title: item.title || 'No title',
      summary: item.title || 'No summary',
      source: item.publisher || 'Yahoo Finance',
      url: item.link || '#',
      publishedAt: new Date(item.providerPublishTime ? item.providerPublishTime * 1000 : Date.now()).toISOString(),
      sentiment: 'neutral' as const,
      impact: 'medium' as const,
      relatedSymbols: item.relatedTickers || [],
    }));
  } catch (error) {
    console.error(`[Yahoo HTTP] News failed for query "${query}":`, error);
    return [];
  }
}
