import { ALL_SYMBOLS } from './constants.ts';
import type { MarketType, Timeframe } from '@/types/market';

const SUPPORTED_SYMBOLS = new Set(
  ALL_SYMBOLS.map(({ symbol }) => symbol.toUpperCase()),
);
const MARKET_TYPES = new Set<MarketType>(['forex', 'stocks', 'crypto']);
const TIMEFRAMES = new Set<Timeframe>([
  '1m',
  '5m',
  '15m',
  '1H',
  '4H',
  '1D',
  '1W',
]);

export function parseSupportedSymbol(rawValue: string | null): string | null {
  if (!rawValue || rawValue.length > 64) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue).trim().toUpperCase();
  } catch {
    return null;
  }

  const candidates = [
    decoded,
    decoded.includes('/') ? decoded : decoded.replace('-', '/'),
  ];
  return candidates.find((candidate) => SUPPORTED_SYMBOLS.has(candidate)) ?? null;
}

export function parseMarketType(
  rawValue: string | null,
  options: { allowAll?: boolean; optional?: boolean } = {},
): MarketType | 'all' | undefined | null {
  if (rawValue === null || rawValue === '') {
    return options.optional ? undefined : null;
  }
  if (options.allowAll && rawValue === 'all') return 'all';
  return MARKET_TYPES.has(rawValue as MarketType)
    ? rawValue as MarketType
    : null;
}

export function parseTimeframe(
  rawValue: string | null,
  fallback: Timeframe = '1D',
): Timeframe | null {
  if (rawValue === null || rawValue === '') return fallback;
  return TIMEFRAMES.has(rawValue as Timeframe)
    ? rawValue as Timeframe
    : null;
}

export function parseSignalMode(
  rawValue: string | null,
): 'combined' | 'technical' | null {
  if (rawValue === null || rawValue === '') return 'combined';
  return rawValue === 'combined' || rawValue === 'technical'
    ? rawValue
    : null;
}
