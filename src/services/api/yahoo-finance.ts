import YahooFinance from 'yahoo-finance2';
import { AssetData, OHLCV } from '@/types/market';
import { StockFundamentals, NewsItem } from '@/types/analysis';

// Initialize the v3 instance and suppress the survey notice
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
// Isolate bounded scanner requests from legacy quote/news queue stalls.
const signalYahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function aggregateFourHourCandles(candles: OHLCV[]): OHLCV[] {
  const bucketSizeSeconds = 4 * 60 * 60;
  const buckets = new Map<number, OHLCV>();

  for (const candle of candles) {
    const timestamp = Number(candle.time);
    if (!Number.isFinite(timestamp)) continue;
    const bucket = Math.floor(timestamp / bucketSizeSeconds) * bucketSizeSeconds;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { ...candle, time: bucket });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return Array.from(buckets.values()).sort(
    (first, second) => Number(first.time) - Number(second.time),
  );
}

// ==========================================
// SYMBOL MAPPING UTILITIES
// ==========================================

export function mapSymbolToYahoo(symbol: string, marketType: 'stocks' | 'forex' | 'crypto'): string {
  if (marketType === 'forex') {
    if (symbol === 'XAU/USD') return 'GC=F';
    if (symbol === 'XAG/USD') return 'SI=F';
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
// BATCH QUOTE
// ==========================================

export async function fetchYahooBatchQuotes(
  symbols: { symbol: string; name: string }[],
  marketType: 'stocks' | 'forex' | 'crypto'
): Promise<AssetData[]> {
  try {
    const yahooSymbols = symbols.map(s => mapSymbolToYahoo(s.symbol, marketType));
    
    // Fetch individually to prevent one bad symbol from failing the batch
    const quotePromises = yahooSymbols.map(sym => yahooFinance.quote(sym));
    const results = await Promise.allSettled(quotePromises);
    
    const quotes = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && !!r.value)
      .map(r => r.value);
    
    return symbols.map(s => {
      const ySymbol = mapSymbolToYahoo(s.symbol, marketType);
      const quote = quotes.find(q => q.symbol === ySymbol);
      
      if (!quote) {
        return {
          symbol: s.symbol, name: s.name, marketType, price: 0, previousClose: 0, 
          change: 0, changePercent: 0, high24h: 0, low24h: 0, volume: 0, trend: 'sideways' as const
        };
      }

      const price = positiveNumber(quote.regularMarketPrice);
      const previousClose = positiveNumber(
        quote.regularMarketPreviousClose,
        price,
      );
      const change = finiteNumber(
        quote.regularMarketChange,
        price - previousClose,
      );
      const changePercent = finiteNumber(
        quote.regularMarketChangePercent,
        previousClose > 0 ? (change / previousClose) * 100 : 0,
      );

      return {
        symbol: s.symbol,
        name: s.name,
        marketType,
        price,
        previousClose,
        change,
        changePercent,
        high24h: positiveNumber(quote.regularMarketDayHigh, price),
        low24h: positiveNumber(quote.regularMarketDayLow, price),
        volume: Math.max(0, finiteNumber(quote.regularMarketVolume)),
        marketCap: positiveNumber(quote.marketCap) || undefined,
        trend: change >= 0 ? 'bullish' : 'bearish',
        marketState: quote.marketState,
      };
    });
  } catch (error) {
    console.error(`[Yahoo Finance 2] Batch fetch failed for ${marketType}:`, error);
    return [];
  }
}


// ==========================================
// ASSET PRICE (QUOTE)
// ==========================================

export async function fetchYahooQuote(
  symbol: string, 
  name: string, 
  marketType: 'stocks' | 'forex' | 'crypto'
): Promise<AssetData | null> {
  try {
    const yahooSymbol = mapSymbolToYahoo(symbol, marketType);
    const quote = await yahooFinance.quote(yahooSymbol);
    
    if (!quote) return null;

    const price = positiveNumber(quote.regularMarketPrice);
    if (price <= 0) return null;
    const previousClose = positiveNumber(
      quote.regularMarketPreviousClose,
      price,
    );
    const change = finiteNumber(
      quote.regularMarketChange,
      price - previousClose,
    );
    const changePercent = finiteNumber(
      quote.regularMarketChangePercent,
      previousClose > 0 ? (change / previousClose) * 100 : 0,
    );

    return {
      symbol,
      name,
      marketType,
      price,
      previousClose,
      change,
      changePercent,
      high24h: positiveNumber(quote.regularMarketDayHigh, price),
      low24h: positiveNumber(quote.regularMarketDayLow, price),
      volume: Math.max(0, finiteNumber(quote.regularMarketVolume)),
      marketCap: positiveNumber(quote.marketCap) || undefined,
      trend: change >= 0 ? 'bullish' : 'bearish',
      marketState: quote.marketState,
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}

// ==========================================
// HISTORICAL CHART (OHLCV)
// ==========================================

/** Strict feed for the advanced scanner: never fabricate missing O/H/L. */
export async function fetchYahooSignalCandles(
  symbol: string, marketType: 'forex' | 'crypto', timeframe: '15m' | '1H' | '1D',
): Promise<OHLCV[]> {
  const days = timeframe === '15m' ? 7 : timeframe === '1H' ? 90 : 730;
  const result = await signalYahooFinance.chart(mapSymbolToYahoo(symbol, marketType), {
    period1: new Date(Date.now() - days * 86_400_000),
    interval: timeframe === '15m' ? '15m' : timeframe === '1H' ? '60m' : '1d',
  }, { fetchOptions: { signal: AbortSignal.timeout(12_000) } });
  return (result.quotes ?? []).flatMap((row): OHLCV[] => {
    // Empty session placeholders are not candles; partially invalid rows are
    // retained as invalid so the quality gate, not an invented price, decides.
    if ([row.open, row.high, row.low, row.close].every(value => value === null || value === undefined)) return [];
    return [{ time: Math.floor(new Date(row.date).getTime() / 1000),
      open: row.open ?? NaN, high: row.high ?? NaN, low: row.low ?? NaN, close: row.close ?? NaN,
      volume: row.volume ?? 0 }];
  });
}

export async function fetchYahooOHLCV(
  symbol: string, 
  marketType: 'stocks' | 'forex' | 'crypto',
  timeframe: string = '1D'
): Promise<OHLCV[]> {
  try {
    const yahooSymbol = mapSymbolToYahoo(symbol, marketType);
    
    let interval = '1d';
    let range = '1y'; // default range
    
    if (timeframe === '1m') { interval = '1m'; range = '7d'; }
    else if (timeframe === '5m') { interval = '5m'; range = '60d'; }
    else if (timeframe === '15m') { interval = '15m'; range = '60d'; }
    else if (timeframe === '1H') { interval = '60m'; range = '730d'; }
    else if (timeframe === '4H') { interval = '60m'; range = '730d'; } // fallback to 1h
    else if (timeframe === '1D') { interval = '1d'; range = '1y'; }
    else if (timeframe === '1W') { interval = '1wk'; range = '5y'; }
    
    // Convert range to period1
    const period1 = new Date();
    if (range === '7d') period1.setDate(period1.getDate() - 7);
    else if (range === '60d') period1.setDate(period1.getDate() - 60);
    else if (range === '730d') period1.setFullYear(period1.getFullYear() - 2);
    else if (range === '5y') period1.setFullYear(period1.getFullYear() - 5);
    else period1.setFullYear(period1.getFullYear() - 1); // 1y default
    
    const chartResult = await yahooFinance.chart(yahooSymbol, {
      period1,
      interval: interval as any
    });

    if (!chartResult || !chartResult.quotes) return [];

    const candles = chartResult.quotes.flatMap((item): OHLCV[] => {
      const timeInSeconds = Math.floor(new Date(item.date).getTime() / 1000);
      const close = positiveNumber(item.close);
      if (!Number.isFinite(timeInSeconds) || close <= 0) return [];

      const open = positiveNumber(item.open, close);
      const high = positiveNumber(item.high, Math.max(open, close));
      const low = positiveNumber(item.low, Math.min(open, close));
      if (high < Math.max(open, close) || low > Math.min(open, close)) {
        return [];
      }

      return [{
        time: timeInSeconds,
        open,
        high,
        low,
        close,
        volume: Math.max(0, finiteNumber(item.volume)),
      }];
    });
    return timeframe === '4H'
      ? aggregateFourHourCandles(candles)
      : candles;
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch OHLCV for ${symbol}:`, error);
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
    const summary = await yahooFinance.quoteSummary(yahooSymbol, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail']
    });

    const stats = summary.defaultKeyStatistics;
    const fin = summary.financialData;
    const detail = summary.summaryDetail;

    if (!stats || !fin) return null;

    return {
      peRatio: detail?.trailingPE || 0,
      pbv: stats.priceToBook || 0,
      eps: stats.trailingEps || 0,
      revenueGrowth: (fin.revenueGrowth || 0) * 100,
      netProfitMargin: (fin.profitMargins || 0) * 100,
      debtToEquity: fin.debtToEquity || 0,
      roe: (fin.returnOnEquity || 0) * 100,
      dividendYield: (detail?.dividendYield || 0) * 100,
      marketCap: detail?.marketCap || 0,
      quarterlyRevenue: [], 
      newsHeadlines: [],
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch fundamentals for ${symbol}:`, error);
    return null;
  }
}

// ==========================================
// NEWS SEARCH
// ==========================================

export async function fetchYahooNews(query: string): Promise<NewsItem[]> {
  try {
    const searchResult = await yahooFinance.search(query, { newsCount: 10 });
    
    if (!searchResult.news) return [];

    return searchResult.news.map((item: any, index: number) => ({
      id: item.uuid || `yahoo-${index}`,
      title: item.title,
      summary: item.title,
      source: item.publisher || 'Yahoo Finance',
      url: item.link,
      publishedAt: new Date(item.providerPublishTime || Date.now()).toISOString(),
      sentiment: 'neutral',
      impact: 'medium',
      relatedSymbols: item.relatedTickers || [],
    }));
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch news for query "${query}":`, error);
    return [];
  }
}
