import { NextResponse } from 'next/server';
import { getAssetPrice, getOHLCV } from '@/services/market-data';
import { parseSupportedSymbol, parseTimeframe } from '@/lib/market-input';
import type { AssetData, OHLCV } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const resolvedParams = await params;
    const symbol = parseSupportedSymbol(resolvedParams.symbol);
    const { searchParams } = new URL(request.url);
    const includeChart = searchParams.get('chart') === 'true';
    const timeframe = parseTimeframe(searchParams.get('timeframe'));

    if (!symbol || !timeframe) {
      return NextResponse.json(
        { success: false, error: 'Unsupported symbol or timeframe' },
        { status: 400 },
      );
    }

    const asset = await getAssetPrice(symbol);
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const result: { asset: AssetData; chart?: OHLCV[] } = { asset };

    if (includeChart) {
      const ohlcv = await getOHLCV(symbol, timeframe);
      result.chart = ohlcv;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Asset API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch asset data' },
      { status: 500 }
    );
  }
}
