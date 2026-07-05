export type MarketType = 'forex' | 'stocks' | 'crypto';

export type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | '1D' | '1W';

export type TrendDirection = 'bullish' | 'bearish' | 'sideways';

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AssetData {
  symbol: string;
  name: string;
  marketType: MarketType;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume: number;
  marketCap?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  fullyDilutedValuation?: number;
  trend: TrendDirection;
}

export interface MarketOverview {
  marketType: MarketType;
  totalAssets: number;
  bullishCount: number;
  bearishCount: number;
  sidewaysCount: number;
  topGainers: AssetData[];
  topLosers: AssetData[];
  mostActive: AssetData[];
}

export interface PriceAlert {
  id: string;
  symbol: string;
  marketType: MarketType;
  condition: 'above' | 'below';
  targetPrice: number;
  currentPrice: number;
  isTriggered: boolean;
  createdAt: string;
}
