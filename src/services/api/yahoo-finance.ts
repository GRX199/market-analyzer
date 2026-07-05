import yahooFinance from 'yahoo-finance2';
import { AssetData, OHLCV } from '@/types/market';
import { StockFundamentals, NewsItem } from '@/types/analysis';

// ==========================================
// SYMBOL MAPPING UTILITIES
// ==========================================

// Stocks ending with .JK are Indonesian. 
// Forex must end with =X (e.g. EURUSD=X)
export function mapSymbolToYahoo(symbol: string, marketType: 'stocks' | 'forex' | 'crypto'): string {
  if (marketType === 'forex') {
    return `${symbol.replace('/', '')}=X`;
  }
  
  if (marketType === 'crypto') {
    return `${symbol.replace('/USDT', '-USD')}`;
  }
  
  if (marketType === 'stocks') {
    // Indonesian stocks need .JK suffix
    const indonesianStocks = ['BBCA', 'BBRI', 'BMRI', 'ASII', 'TLKM', 'GOTO'];
    if (indonesianStocks.includes(symbol)) {
      return `${symbol}.JK`;
    }
    return symbol;
  }
  
  return symbol;
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

    const price = quote.regularMarketPrice || 0;
    const previousClose = quote.regularMarketPreviousClose || price;
    const change = quote.regularMarketChange || (price - previousClose);
    const changePercent = quote.regularMarketChangePercent || ((change / previousClose) * 100);

    return {
      symbol,
      name,
      marketType,
      price,
      previousClose,
      change,
      changePercent,
      high24h: quote.regularMarketDayHigh || price,
      low24h: quote.regularMarketDayLow || price,
      volume: quote.regularMarketVolume || 0,
      marketCap: quote.marketCap || undefined,
      trend: change >= 0 ? 'bullish' : 'bearish',
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch quote for ${symbol}:`, error);
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
    
    // Fetch last 1 year of daily data
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);
    
    const historical = await yahooFinance.historical(yahooSymbol, {
      period1,
      interval: '1d'
    });

    return historical.map((item: any) => ({
      time: Math.floor(new Date(item.date).getTime() / 1000),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume || 0,
    }));
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
      quarterlyRevenue: [], // Yahoo doesn't easily expose this in standard modules without scraping incomeStatementHistory
      newsHeadlines: [], // Fetched separately
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
      summary: item.title, // Yahoo search often doesn't give a good snippet in the search endpoint, use title
      source: item.publisher || 'Yahoo Finance',
      url: item.link,
      publishedAt: new Date(item.providerPublishTime ? item.providerPublishTime * 1000 : Date.now()).toISOString(),
      sentiment: 'neutral', // Placeholder
      impact: 'medium', // Placeholder
      relatedSymbols: item.relatedTickers || [],
    }));
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch news for query "${query}":`, error);
    return [];
  }
}
