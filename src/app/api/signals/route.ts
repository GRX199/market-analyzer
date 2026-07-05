import { NextResponse } from 'next/server';
import { SignalType } from '@/types/analysis';

// Mock signals history database
const mockSignals = [
  { id: '1', symbol: 'BTC/USDT', type: 'strong_buy' as SignalType, priceAtSignal: 62000, date: new Date(Date.now() - 86400000).toISOString(), score: 85 },
  { id: '2', symbol: 'EUR/USD', type: 'sell' as SignalType, priceAtSignal: 1.0950, date: new Date(Date.now() - 172800000).toISOString(), score: 35 },
  { id: '3', symbol: 'AAPL', type: 'buy' as SignalType, priceAtSignal: 175.50, date: new Date(Date.now() - 259200000).toISOString(), score: 72 },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    let data = mockSignals;
    if (symbol) {
      data = mockSignals.filter(s => s.symbol === symbol);
    }
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Signals API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}
