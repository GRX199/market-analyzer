// ============================================================
// Market Data Service — YAHOO FINANCE HTTP (No npm package needed)
// ============================================================

import { AssetData, OHLCV, MarketType, MarketOverview } from '@/types/market';
import { fetchYahooBatchQuotes, fetchYahooQuote, fetchYahooOHLCV, mapSymbolToYahoo } from './api/yahoo-finance';
import { STOCK_SYMBOLS, FOREX_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/constants';

function isForexSymbol(symbol: string) {
  return FOREX_SYMBOLS.some(s => s.symbol === symbol);
}

function isStockSymbol(symbol: string) {
  return STOCK_SYMBOLS.some(s => s.symbol === symbol);
}

function isCryptoSymbol(symbol: string) {
  return CRYPTO_SYMBOLS.some(s => s.symbol === symbol);
}

/**
 * Get list of assets — uses Yahoo Finance HTTP API directly
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
    let symbolsList = STOCK_SYMBOLS;
    if (marketType === 'forex') symbolsList = FOREX_SYMBOLS;
    if (marketType === 'crypto') symbolsList = CRYPTO_SYMBOLS;

    return await fetchYahooBatchQuotes(symbolsList, marketType);
  } catch (error) {
    console.error(`[Market Data] Failed for ${marketType}:`, error);
    return [];
  }
}

/**
 * Get single asset price
 */
export async function getAssetPrice(symbol: string): Promise<AssetData | null> {
  try {
    if (isCryptoSymbol(symbol)) {
      const meta = CRYPTO_SYMBOLS.find(s => s.symbol === symbol);
      return await fetchYahooQuote(symbol, meta?.name || symbol, 'crypto');
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
    console.error(`[Market Data] Failed for ${symbol}:`, error);
  }

  return null;
}

/**
 * Get OHLCV candlestick data
 */
export async function getOHLCV(symbol: string): Promise<OHLCV[]> {
  try {
    if (isCryptoSymbol(symbol)) {
      return await fetchYahooOHLCV(symbol, 'crypto');
    }
    if (isStockSymbol(symbol)) {
      return await fetchYahooOHLCV(symbol, 'stocks');
    }
    if (isForexSymbol(symbol)) {
      return await fetchYahooOHLCV(symbol, 'forex');
    }
  } catch (error) {
    console.error(`[Market Data] OHLCV failed for ${symbol}:`, error);
  }

  return [];
}

/**
 * Get market overview — aggregates asset data
 */
export async function getMarketOverview(marketType: MarketType): Promise<MarketOverview> {
  const assets = await getAssetList(marketType);
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

// Re-export for backward compatibility
export { isCryptoSymbol };
