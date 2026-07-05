// ============================================================
// CoinGecko API Client — FREE, no API key required
// Provides real-time Crypto prices, OHLCV, and market data
// ============================================================

import { AssetData, OHLCV, TrendDirection } from '@/types/market';
import { CryptoFundamentals, NewsItem } from '@/types/analysis';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Map our internal symbols to CoinGecko IDs
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC/USDT': 'bitcoin',
  'ETH/USDT': 'ethereum',
  'SOL/USDT': 'solana',
  'BNB/USDT': 'binancecoin',
  'XRP/USDT': 'ripple',
  'ADA/USDT': 'cardano',
  'DOGE/USDT': 'dogecoin',
  'DOT/USDT': 'polkadot',
  'LINK/USDT': 'chainlink',
  'MATIC/USDT': 'matic-network',
  'AVAX/USDT': 'avalanche-2',
  'SHIB/USDT': 'shiba-inu',
  'LTC/USDT': 'litecoin',
};

const COINGECKO_ID_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_COINGECKO_ID).map(([k, v]) => [v, k])
);

const SYMBOL_NAMES: Record<string, string> = {
  'BTC/USDT': 'Bitcoin',
  'ETH/USDT': 'Ethereum',
  'SOL/USDT': 'Solana',
  'BNB/USDT': 'Binance Coin',
  'XRP/USDT': 'Ripple',
  'ADA/USDT': 'Cardano',
  'DOGE/USDT': 'Dogecoin',
  'DOT/USDT': 'Polkadot',
};

async function fetchJSON(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cache: 'no-store', // Always fresh data on client
    });
    if (!res.ok) throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function determineTrend(priceChange24h: number): TrendDirection {
  if (priceChange24h > 1.5) return 'bullish';
  if (priceChange24h < -1.5) return 'bearish';
  return 'sideways';
}

// ============ PUBLIC API FUNCTIONS ============

/**
 * Fetch all crypto asset prices from CoinGecko
 */
export async function fetchCryptoAssets(): Promise<AssetData[]> {
  const ids = Object.values(SYMBOL_TO_COINGECKO_ID).join(',');
  const data = await fetchJSON(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`
  );

  return data.map((coin: any) => {
    const symbol = COINGECKO_ID_TO_SYMBOL[coin.id] || coin.symbol.toUpperCase();
    const change = coin.current_price - (coin.current_price / (1 + coin.price_change_percentage_24h / 100));
    return {
      symbol,
      name: SYMBOL_NAMES[symbol] || coin.name,
      marketType: 'crypto' as const,
      price: coin.current_price,
      previousClose: coin.current_price - change,
      change: change,
      changePercent: coin.price_change_percentage_24h || 0,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      volume: coin.total_volume,
      marketCap: coin.market_cap,
      circulatingSupply: coin.circulating_supply,
      totalSupply: coin.total_supply,
      fullyDilutedValuation: coin.fully_diluted_valuation,
      trend: determineTrend(coin.price_change_percentage_24h || 0),
    };
  });
}

/**
 * Fetch single crypto asset detail
 */
export async function fetchCryptoAssetDetail(symbol: string): Promise<AssetData | null> {
  const geckoId = SYMBOL_TO_COINGECKO_ID[symbol];
  if (!geckoId) return null;

  const data = await fetchJSON(
    `${COINGECKO_BASE}/coins/${geckoId}?localization=false&tickers=false&community_data=false&developer_data=true`
  );

  const marketData = data.market_data;
  const change = marketData.price_change_24h || 0;
  
  return {
    symbol,
    name: SYMBOL_NAMES[symbol] || data.name,
    marketType: 'crypto',
    price: marketData.current_price.usd,
    previousClose: marketData.current_price.usd - change,
    change,
    changePercent: marketData.price_change_percentage_24h || 0,
    high24h: marketData.high_24h.usd,
    low24h: marketData.low_24h.usd,
    volume: marketData.total_volume.usd,
    marketCap: marketData.market_cap.usd,
    circulatingSupply: marketData.circulating_supply,
    totalSupply: marketData.total_supply,
    fullyDilutedValuation: marketData.fully_diluted_valuation?.usd,
    trend: determineTrend(marketData.price_change_percentage_24h || 0),
  };
}

/**
 * Fetch crypto OHLCV candlestick data (365 days daily)
 */
export async function fetchCryptoOHLCV(symbol: string, days: number = 365): Promise<OHLCV[]> {
  const geckoId = SYMBOL_TO_COINGECKO_ID[symbol];
  if (!geckoId) return [];

  const data = await fetchJSON(
    `${COINGECKO_BASE}/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`
  );

  // CoinGecko OHLC returns: [timestamp, open, high, low, close]
  return data.map((candle: number[]) => ({
    time: Math.floor(candle[0] / 1000), // Convert ms to seconds
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: 0, // CoinGecko OHLC doesn't include volume
  }));
}

/**
 * Fetch crypto fundamentals from CoinGecko
 */
export async function fetchCryptoFundamentals(symbol: string): Promise<CryptoFundamentals | null> {
  const geckoId = SYMBOL_TO_COINGECKO_ID[symbol];
  if (!geckoId) return null;

  // Fetch coin details + global data in parallel
  const [coinData, globalData, fearGreedData] = await Promise.all([
    fetchJSON(`${COINGECKO_BASE}/coins/${geckoId}?localization=false&tickers=false&community_data=false&developer_data=true`),
    fetchJSON(`${COINGECKO_BASE}/global`),
    fetchFearGreedIndex().catch(() => 50), // Fallback to 50 (neutral)
  ]);

  const md = coinData.market_data;
  const devScore = coinData.developer_data
    ? Math.min(100, (coinData.developer_data.commit_count_4_weeks || 0) * 2)
    : 50;

  // Determine whale activity from volume vs market cap ratio
  const volumeToMcap = md.total_volume.usd / md.market_cap.usd;
  const whaleActivity = volumeToMcap > 0.15 ? 'accumulating' : volumeToMcap < 0.05 ? 'distributing' : 'neutral';
  
  // Exchange flow based on 24h volume trend
  const exchangeFlow = md.price_change_percentage_24h > 2 ? 'outflow' : md.price_change_percentage_24h < -2 ? 'inflow' : 'neutral';

  return {
    marketCap: md.market_cap.usd,
    volume24h: md.total_volume.usd,
    circulatingSupply: md.circulating_supply,
    totalSupply: md.total_supply || md.circulating_supply,
    fullyDilutedValuation: md.fully_diluted_valuation?.usd || md.market_cap.usd,
    tvl: md.total_value_locked?.usd,
    developerActivity: devScore,
    fearGreedIndex: fearGreedData,
    bitcoinDominance: globalData.data.market_cap_percentage?.btc || 50,
    whaleActivity: whaleActivity as 'accumulating' | 'distributing' | 'neutral',
    exchangeFlow: exchangeFlow as 'inflow' | 'outflow' | 'neutral',
    newsHeadlines: [], // We populate this from the news service separately
  };
}

/**
 * Fetch Crypto Fear & Greed Index from alternative.me
 */
async function fetchFearGreedIndex(): Promise<number> {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
  return parseInt(data.data?.[0]?.value || '50', 10);
}

/**
 * Check if a symbol is a known crypto symbol
 */
export function isCryptoSymbol(symbol: string): boolean {
  return symbol in SYMBOL_TO_COINGECKO_ID;
}
