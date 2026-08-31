import { NextResponse } from 'next/server';
import { FOREX_SYMBOLS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_FOREX_SYMBOLS = new Set(
  FOREX_SYMBOLS.map(({ symbol }) => symbol),
);
const MAX_SYMBOLS_PER_REQUEST = 20;

function parseGoogleFinancePrice(value: string): number | null {
  const normalized = value
    .replace(/\u00a0/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!normalized) return null;

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  let canonical = normalized;

  if (commaIndex >= 0 && dotIndex >= 0) {
    canonical = commaIndex > dotIndex
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (commaIndex >= 0) {
    const decimalDigits = normalized.length - commaIndex - 1;
    canonical = decimalDigits === 3
      ? normalized.replace(/,/g, '')
      : normalized.replace(',', '.');
  }

  const price = Number(canonical);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const requestedSymbols = Array.from(new Set(
    symbolsParam
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  ));
  if (
    requestedSymbols.length < 1
    || requestedSymbols.length > MAX_SYMBOLS_PER_REQUEST
    || requestedSymbols.some((symbol) => !ALLOWED_FOREX_SYMBOLS.has(symbol))
  ) {
    return NextResponse.json(
      { error: `symbols must contain 1-${MAX_SYMBOLS_PER_REQUEST} supported forex pairs` },
      { status: 400 },
    );
  }

  try {
    const parsedPrices: Record<string, number> = {};

    await Promise.all(
      requestedSymbols.map(async (sym) => {
        const gfSymbol = sym.replace('/', '-');
        const url =
          `https://www.google.com/finance/quote/${encodeURIComponent(gfSymbol)}?hl=en`;
        
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(8_000),
          });

          if (response.ok) {
            const html = await response.text();
            const match = html.match(/class="YMlKec fxKbKc">([^<]+)<\/div>/);
            if (match && match[1]) {
              const price = parseGoogleFinancePrice(match[1]);
              if (price !== null) {
                parsedPrices[sym] = price;
              }
            }
          }
        } catch {
          // Ignore individual fetch errors
        }
      })
    );

    return NextResponse.json(parsedPrices);

  } catch (error: unknown) {
    console.error(
      'Forex Proxy Error:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json({ error: 'Failed to fetch forex data' }, { status: 500 });
  }
}
