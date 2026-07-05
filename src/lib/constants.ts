import { MarketType, Timeframe } from '@/types/market';
import { SignalType, RiskLevel } from '@/types/analysis';

export const SIGNAL_COLORS: Record<SignalType, string> = {
  strong_buy: '#00C853',
  buy: '#4CAF50',
  hold: '#FFC107',
  sell: '#FF5252',
  strong_sell: '#D50000',
};

export const SIGNAL_BG_COLORS: Record<SignalType, string> = {
  strong_buy: 'rgba(0, 200, 83, 0.15)',
  buy: 'rgba(76, 175, 80, 0.15)',
  hold: 'rgba(255, 193, 7, 0.15)',
  sell: 'rgba(255, 82, 82, 0.15)',
  strong_sell: 'rgba(213, 0, 0, 0.15)',
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  strong_buy: 'Strong Buy',
  buy: 'Buy',
  hold: 'Hold',
  sell: 'Sell',
  strong_sell: 'Strong Sell',
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#4CAF50',
  medium: '#FFC107',
  high: '#FF5252',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
};

export const TREND_COLORS = {
  bullish: '#4CAF50',
  bearish: '#FF5252',
  sideways: '#FFC107',
};

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1 Min' },
  { value: '5m', label: '5 Min' },
  { value: '15m', label: '15 Min' },
  { value: '1H', label: '1 Hour' },
  { value: '4H', label: '4 Hours' },
  { value: '1D', label: '1 Day' },
  { value: '1W', label: '1 Week' },
];

export const MARKET_TYPES: { value: MarketType; label: string; icon: string }[] = [
  { value: 'forex', label: 'Forex', icon: '💱' },
  { value: 'stocks', label: 'Stocks', icon: '📈' },
  { value: 'crypto', label: 'Crypto', icon: '₿' },
];

export const FOREX_SYMBOLS = [
  // Majors
  { symbol: 'EUR/USD', name: 'Euro / US Dollar' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen' },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc' },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar' },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar / US Dollar' },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar' },
  // Minors (Crosses)
  { symbol: 'EUR/GBP', name: 'Euro / British Pound' },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen' },
  { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen' },
  { symbol: 'AUD/JPY', name: 'Australian Dollar / Japanese Yen' },
  { symbol: 'EUR/AUD', name: 'Euro / Australian Dollar' },
  { symbol: 'EUR/CAD', name: 'Euro / Canadian Dollar' },
  { symbol: 'EUR/CHF', name: 'Euro / Swiss Franc' },
  { symbol: 'GBP/AUD', name: 'British Pound / Australian Dollar' },
  { symbol: 'GBP/CAD', name: 'British Pound / Canadian Dollar' },
  { symbol: 'GBP/CHF', name: 'British Pound / Swiss Franc' },
  { symbol: 'AUD/CAD', name: 'Australian Dollar / Canadian Dollar' },
  { symbol: 'AUD/CHF', name: 'Australian Dollar / Swiss Franc' },
  { symbol: 'AUD/NZD', name: 'Australian Dollar / New Zealand Dollar' },
  { symbol: 'CAD/JPY', name: 'Canadian Dollar / Japanese Yen' },
  { symbol: 'CHF/JPY', name: 'Swiss Franc / Japanese Yen' },
  // Exotics
  { symbol: 'USD/SGD', name: 'US Dollar / Singapore Dollar' },
  { symbol: 'USD/HKD', name: 'US Dollar / Hong Kong Dollar' },
  { symbol: 'USD/ZAR', name: 'US Dollar / South African Rand' },
  { symbol: 'USD/MXN', name: 'US Dollar / Mexican Peso' },
  { symbol: 'USD/TRY', name: 'US Dollar / Turkish Lira' },
  { symbol: 'USD/IDR', name: 'US Dollar / Indonesian Rupiah' },
];

export const STOCK_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'INTC', name: 'Intel Corporation' },
  { symbol: 'BBCA', name: 'Bank Central Asia' },
  { symbol: 'BBRI', name: 'Bank Rakyat Indonesia' },
  { symbol: 'BMRI', name: 'Bank Mandiri' },
  { symbol: 'ASII', name: 'Astra International' },
];

export const CRYPTO_SYMBOLS = [
  { symbol: 'BTC/USDT', name: 'Bitcoin' },
  { symbol: 'ETH/USDT', name: 'Ethereum' },
  { symbol: 'SOL/USDT', name: 'Solana' },
  { symbol: 'BNB/USDT', name: 'Binance Coin' },
  { symbol: 'XRP/USDT', name: 'Ripple' },
  { symbol: 'ADA/USDT', name: 'Cardano' },
  { symbol: 'DOGE/USDT', name: 'Dogecoin' },
  { symbol: 'DOT/USDT', name: 'Polkadot' },
  { symbol: 'LINK/USDT', name: 'Chainlink' },
  { symbol: 'MATIC/USDT', name: 'Polygon' },
  { symbol: 'AVAX/USDT', name: 'Avalanche' },
  { symbol: 'SHIB/USDT', name: 'Shiba Inu' },
  { symbol: 'LTC/USDT', name: 'Litecoin' },
];

export const ALL_SYMBOLS = [
  ...FOREX_SYMBOLS.map(s => ({ ...s, marketType: 'forex' as MarketType })),
  ...STOCK_SYMBOLS.map(s => ({ ...s, marketType: 'stocks' as MarketType })),
  ...CRYPTO_SYMBOLS.map(s => ({ ...s, marketType: 'crypto' as MarketType })),
];

export const DISCLAIMER_TEXT = `Analysis and signals in this application are for educational and informational purposes only. This application does not provide financial advice, investment recommendations, or profit guarantees. Trading Forex, stocks, and crypto carries high risk. Users are fully responsible for their own investment decisions.`;

export const SCORE_RANGES = {
  STRONG_SELL: { min: 0, max: 20 },
  SELL: { min: 21, max: 40 },
  HOLD: { min: 41, max: 60 },
  BUY: { min: 61, max: 80 },
  STRONG_BUY: { min: 81, max: 100 },
};

export const SCORE_WEIGHTS = {
  technical: 0.60,
  fundamental: 0.30,
  sentiment: 0.10,
};
