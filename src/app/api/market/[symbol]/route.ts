import { NextResponse } from 'next/server';
import { getAssetPrice, getOHLCV } from '@/services/market-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const resolvedParams = await params;
    const symbol = decodeURIComponent(resolvedParams.symbol).replace('-', '/');
    const { searchParams } = new URL(request.url);
    const includeChart = searchParams.get('chart') === 'true';
    const timeframe = searchParams.get('timeframe') || '1D';

    const asset = await getAssetPrice(symbol);
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const result: any = { asset };

    if (includeChart) {
      const ohlcv = await getOHLCV(symbol, timeframe);
      result.chart = ohlcv;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Asset API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch asset data' },
      { status: 500 }
    );
  }
}
