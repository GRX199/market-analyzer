// ============================================================
// News Service — PRODUCTION MODE (Yahoo Finance)
// ============================================================

import { NewsItem } from '@/types/analysis';
import { MarketType } from '@/types/market';
import { fetchYahooNews } from './api/yahoo-finance';

// In-memory cache for real news
let cachedRealNews: NewsItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getRealNewsWithCache(): Promise<NewsItem[] | null> {
  if (cachedRealNews && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedRealNews;
  }

  try {
    // Yahoo search query for general finance
    const news = await fetchYahooNews('finance');

    if (news.length > 0) {
      // Sort by date, newest first
      news.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      cachedRealNews = news;
      cacheTimestamp = Date.now();
      return news;
    }
    
    return [];
  } catch (error) {
    console.error('[News] ⚠️ Yahoo Finance news failed:', error);
    throw error;
  }
}

export async function getLatestNews(limit?: number): Promise<NewsItem[]> {
  try {
    const realNews = await getRealNewsWithCache();
    let result = realNews || [];
    if (limit && limit > 0) {
      result = result.slice(0, limit);
    }
    return result;
  } catch {
    return [];
  }
}

export async function getNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  try {
    // Fetch specific news from Yahoo
    const specificNews = await fetchYahooNews(symbol);
    if (specificNews.length > 0) return specificNews;
    
    // Fallback to cache filtering
    const realNews = await getRealNewsWithCache();
    if (realNews) {
      return realNews.filter(n => n.relatedSymbols.includes(symbol) || n.title.includes(symbol.split('/')[0]));
    }
  } catch {
    return [];
  }
  return [];
}

export async function getNewsByMarket(market: MarketType): Promise<NewsItem[]> {
  try {
    const specificNews = await fetchYahooNews(market === 'crypto' ? 'cryptocurrency' : market === 'stocks' ? 'stock market' : 'forex');
    if (specificNews.length > 0) return specificNews;

    const realNews = await getRealNewsWithCache();
    if (realNews) {
      // Basic filtering based on keywords
      const keyword = market === 'crypto' ? 'crypto' : market === 'stocks' ? 'stock' : 'forex';
      return realNews.filter(n => 
        n.title.toLowerCase().includes(keyword) || 
        n.summary.toLowerCase().includes(keyword)
      );
    }
  } catch {
    return [];
  }
  return [];
}
