import { NextResponse } from 'next/server';
import { getAssetList } from '@/services/market-data';
import { MarketType } from '@/types/market';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketType = searchParams.get('type') as MarketType | null;

    const data = await getAssetList(marketType || undefined);
    
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Market API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}
