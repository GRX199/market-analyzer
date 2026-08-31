import { NextResponse } from 'next/server';
import { getLatestNews, getNewsBySymbol } from '@/services/news-service';
import { parseSupportedSymbol } from '@/lib/market-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol');
    const symbol = rawSymbol === null ? null : parseSupportedSymbol(rawSymbol);
    const rawLimit = searchParams.get('limit') ?? '10';
    const limit = Number(rawLimit);
    if (
      (rawSymbol !== null && symbol === null)
      || !Number.isInteger(limit)
      || limit < 1
      || limit > 50
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid symbol or limit (1-50)' },
        { status: 400 },
      );
    }

    let data;
    if (symbol) {
      data = await getNewsBySymbol(symbol);
    } else {
      data = await getLatestNews(limit);
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('News API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
