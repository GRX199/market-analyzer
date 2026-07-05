import { NextResponse } from 'next/server';
import { getLatestNews, getNewsBySymbol } from '@/services/news-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '10');

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
