// ============================================================
// Market Data Service — YAHOO FINANCE (No API Key needed)
// ============================================================

import { AssetData, OHLCV, MarketType, MarketOverview } from '@/types/market';
import { fetchCryptoAssets, fetchCryptoAssetDetail, fetchCryptoOHLCV, isCryptoSymbol } from './api/coingecko';
import { fetchYahooQuote, fetchYahooOHLCV, mapSymbolToYahoo } from './api/yahoo-finance';
import { STOCK_SYMBOLS, FOREX_SYMBOLS } from '@/lib/constants';
import yahooFinance from 'yahoo-finance2';

function isForexSymbol(symbol: string) {
  return FOREX_SYMBOLS.some(s => s.symbol === symbol);
}

function isStockSymbol(symbol: string) {
  return STOCK_SYMBOLS.some(s => s.symbol === symbol);
}

/**
 * Get list of assets — ONLY uses real API, returns empty array if unconfigured
 */
export async function getAssetList(marketType?: MarketType): Promise<AssetData[]> {
  if (!marketType) {
    const [forex, stocks, crypto] = await Promise.all([
      getAssetList('forex'),
      getAssetList('stocks'),
      getAssetList('crypto'),
    ]);
    return [...forex, ...stocks, ...crypto];
  }

  try {
    if (marketType === 'crypto') {
      const realData = await fetchCryptoAssets();
      return realData;
    }

    if (marketType === 'stocks' || marketType === 'forex') {
      const symbolsList = marketType === 'stocks' ? STOCK_SYMBOLS : FOREX_SYMBOLS;
      const yahooSymbols = symbolsList.map(s => mapSymbolToYahoo(s.symbol, marketType));
      
      try {
        // Yahoo Finance allows batch quoting
        const quotes = await yahooFinance.quote(yahooSymbols);
        
        return symbolsList.map(s => {
          const ySymbol = mapSymbolToYahoo(s.symbol, marketType);
          const quote = quotes.find(q => q.symbol === ySymbol);
          
          if (!quote) {
            return {
              symbol: s.symbol,
              name: s.name,
              marketType,
              price: 0,
              previousClose: 0,
              change: 0,
              changePercent: 0,
              high24h: 0,
              low24h: 0,
              volume: 0,
              trend: 'sideways'
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
            trend: change >= 0 ? 'bullish' : 'bearish',
          };
        });
      } catch (err) {
        console.error(`[Yahoo] Batch fetch failed for ${marketType}:`, err);
        return [];
      }
    }
  } catch (error) {
    console.error(`[Market Data] ⚠️ Real API failed for ${marketType}:`, error);
  }

  return [];
}

/**
 * Get single asset price — strictly real API
 */
export async function getAssetPrice(symbol: string): Promise<AssetData | null> {
  try {
    if (isCryptoSymbol(symbol)) {
      return await fetchCryptoAssetDetail(symbol);
    }

    if (isStockSymbol(symbol)) {
      const meta = STOCK_SYMBOLS.find(s => s.symbol === symbol);
      return await fetchYahooQuote(symbol, meta?.name || symbol, 'stocks');
    }

    if (isForexSymbol(symbol)) {
      const meta = FOREX_SYMBOLS.find(s => s.symbol === symbol);
      return await fetchYahooQuote(symbol, meta?.name || symbol, 'forex');
    }
  } catch (error) {
    console.error(`[Market Data] ⚠️ Real API failed for ${symbol}:`, error);
    throw error;
  }

  return null;
}

/**
 * Get OHLCV candlestick data — strictly real API
 */
export async function getOHLCV(symbol: string): Promise<OHLCV[]> {
  try {
    if (isCryptoSymbol(symbol)) {
      return await fetchCryptoOHLCV(symbol);
    }

    if (isStockSymbol(symbol)) {
      return await fetchYahooOHLCV(symbol, 'stocks');
    }

    if (isForexSymbol(symbol)) {
      return await fetchYahooOHLCV(symbol, 'forex');
    }
  } catch (error) {
    console.error(`[Market Data] ⚠️ Real OHLCV failed for ${symbol}:`, error);
    throw error; 
  }

  return [];
}

/**
 * Get market overview — aggregates asset data
 */
export async function getMarketOverview(marketType: MarketType): Promise<MarketOverview> {
  const assets = await getAssetList(marketType);
  
  // Filter out the zero-price assets from calculations
  const activeAssets = assets.filter(a => a.price > 0);

  return {
    marketType,
    totalAssets: activeAssets.length > 0 ? activeAssets.length : assets.length,
    bullishCount: activeAssets.filter(a => a.trend === 'bullish').length,
    bearishCount: activeAssets.filter(a => a.trend === 'bearish').length,
    sidewaysCount: activeAssets.filter(a => a.trend === 'sideways').length,
    topGainers: [...activeAssets].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3),
    topLosers: [...activeAssets].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3),
    mostActive: [...activeAssets].sort((a, b) => b.volume - a.volume).slice(0, 3),
  };
}

/**
 * Determine market type from symbol
 */
export function getMarketTypeForSymbol(symbol: string): MarketType {
  if (isCryptoSymbol(symbol)) return 'crypto';
  if (isForexSymbol(symbol)) return 'forex';
  return 'stocks';
}
