import { MarketType, TrendDirection } from './market';

export type SignalType = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface MovingAverageData {
  period: number;
  value: number;
  signal: 'buy' | 'sell' | 'neutral';
  priceRelation: 'above' | 'below';
}

export interface RSIData {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface MACDData {
  macdLine: number;
  signalLine: number;
  histogram: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  crossover: 'bullish_crossover' | 'bearish_crossover' | 'none';
}

export interface BollingerBandsData {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  position: 'above_upper' | 'near_upper' | 'middle' | 'near_lower' | 'below_lower';
}

export interface StochRSIData {
  k: number;
  d: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface ATRData {
  value: number;
  percentOfPrice: number;
  volatility: 'low' | 'medium' | 'high';
}

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;
}

export interface PivotPointData {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface CandlestickPattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  description: string;
}

export interface TechnicalAnalysis {
  movingAverages: MovingAverageData[];
  rsi: RSIData;
  macd: MACDData;
  bollingerBands: BollingerBandsData;
  stochRSI: StochRSIData;
  atr: ATRData;
  pivotPoints: PivotPointData;
  supportResistance: SupportResistanceLevel[];
  patterns: CandlestickPattern[];
  volumeMA: { current: number; average: number; signal: 'above_average' | 'below_average' };
  score: number;
  reasons: string[];
}

export interface ForexFundamentals {
  baseCurrency: string;
  quoteCurrency: string;
  baseInterestRate: number;
  quoteInterestRate: number;
  baseInflation: number;
  quoteInflation: number;
  baseGDP: number;
  quoteGDP: number;
  baseUnemployment: number;
  quoteUnemployment: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  economicEvents: EconomicEvent[];
  currencyStrength: { base: number; quote: number };
}

export interface EconomicEvent {
  date: string;
  country: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface StockFundamentals {
  peRatio: number;
  pbv: number;
  eps: number;
  revenueGrowth: number;
  netProfitMargin: number;
  debtToEquity: number;
  roe: number;
  dividendYield: number;
  marketCap: number;
  quarterlyRevenue: { quarter: string; revenue: number; profit: number }[];
  newsHeadlines: NewsItem[];
}

export interface CryptoFundamentals {
  marketCap: number;
  volume24h: number;
  circulatingSupply: number;
  totalSupply: number;
  fullyDilutedValuation: number;
  tvl?: number;
  developerActivity: number;
  fearGreedIndex: number;
  bitcoinDominance: number;
  whaleActivity: 'accumulating' | 'distributing' | 'neutral';
  exchangeFlow: 'inflow' | 'outflow' | 'neutral';
  newsHeadlines: NewsItem[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  relatedSymbols: string[];
}

export interface FundamentalAnalysis {
  marketType: MarketType;
  data: ForexFundamentals | StockFundamentals | CryptoFundamentals;
  score: number;
  reasons: string[];
}

export interface SentimentAnalysis {
  overallSentiment: 'positive' | 'negative' | 'neutral';
  newsScore: number;
  socialScore: number;
  fearGreedIndex?: number;
  score: number;
  reasons: string[];
}

export interface FinalAnalysis {
  symbol: string;
  marketType: MarketType;
  technical: TechnicalAnalysis;
  fundamental: FundamentalAnalysis;
  sentiment: SentimentAnalysis;
  finalScore: number;
  signal: SignalType;
  confidence: number;
  riskLevel: RiskLevel;
  trend: TrendDirection;
  reasons: string[];
  buyFactors: string[];
  sellFactors: string[];
  riskFactors: string[];
  supportLevel: number;
  resistanceLevel: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: string;
}

export interface SignalHistoryItem {
  id: string;
  symbol: string;
  marketType: MarketType;
  signalType: SignalType;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
  finalScore: number;
  confidence: number;
  riskLevel: RiskLevel;
  trend: TrendDirection;
  priceAtSignal: number;
  currentPrice: number;
  priceChangePct: number;
  reasons: string[];
  supportLevel: number;
  resistanceLevel: number;
  stopLoss: number;
  takeProfit: number;
  evaluationStatus: 'profit' | 'loss' | 'pending';
  timeframe: string;
  createdAt: string;
  evaluatedAt?: string;
}
