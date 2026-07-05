// ============================================================
// Fundamental Data Service — PRODUCTION MODE (Yahoo Finance)
// ============================================================

import { MarketType } from '@/types/market';
import { ForexFundamentals, StockFundamentals, CryptoFundamentals } from '@/types/analysis';
import { fetchCryptoFundamentals, isCryptoSymbol } from './api/coingecko';
import { fetchYahooFundamentals } from './api/yahoo-finance';
import { STOCK_SYMBOLS } from '@/lib/constants';

function isStockSymbol(symbol: string) {
  return STOCK_SYMBOLS.some(s => s.symbol === symbol);
}

export async function getFundamentalData(
  symbol: string,
  marketType: MarketType
): Promise<ForexFundamentals | StockFundamentals | CryptoFundamentals | null> {
  try {
    if (marketType === 'crypto' && isCryptoSymbol(symbol)) {
      return await fetchCryptoFundamentals(symbol);
    }

    if (marketType === 'stocks' && isStockSymbol(symbol)) {
      return await fetchYahooFundamentals(symbol);
    }
    
    // Yahoo Finance doesn't have an endpoint for macroeconomic forex fundamentals
    // (interest rates, inflation). For forex we return null.
    if (marketType === 'forex') {
       return null;
    }
  } catch (error) {
    console.error(`[Fundamentals] ⚠️ Real API failed for ${symbol}:`, error);
    throw error;
  }

  return null;
}
