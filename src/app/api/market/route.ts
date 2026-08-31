import { NextResponse } from 'next/server';
import { getAssetList } from '@/services/market-data';
import { parseMarketType } from '@/lib/market-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('type');
    const parsedMarket = parseMarketType(param, {
      allowAll: true,
      optional: true,
    });
    if (parsedMarket === null) {
      return NextResponse.json(
        { success: false, error: 'type must be forex, stocks, crypto, or all' },
        { status: 400 },
      );
    }
    const marketType = parsedMarket === 'all' ? undefined : parsedMarket;

    const data = await getAssetList(marketType);
    
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Market API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}
