import { NextResponse } from 'next/server';
import { SignalType } from '@/types/analysis';
import { getAssetList, getOHLCV } from '@/services/market-data';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { MarketType } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const marketParam = searchParams.get('market') as MarketType || 'crypto';

    if (symbol) {
      // Analyze single symbol
      const ohlcv = await getOHLCV(symbol, '1D');
      if (!ohlcv || ohlcv.length === 0) return NextResponse.json({ success: true, data: [] });
      
      const tech = calculateTechnicalScore(ohlcv);
      
      let type: SignalType = 'hold';
      if (tech.score >= 80) type = 'strong_buy';
      else if (tech.score >= 60) type = 'buy';
      else if (tech.score <= 20) type = 'strong_sell';
      else if (tech.score <= 40) type = 'sell';

      return NextResponse.json({
        success: true,
        data: [{
          id: symbol,
          symbol,
          type,
          priceAtSignal: ohlcv[ohlcv.length - 1].close,
          date: new Date().toISOString(),
          score: tech.score
        }]
      });
    }

    // Analyze top assets in the market to find opportunities
    const assets = await getAssetList(marketParam);
    const topAssets = assets.slice(0, 12); // Take first 12 to provide more opportunities

    const signalsPromises = topAssets.map(async (asset) => {
      const ohlcv = await getOHLCV(asset.symbol, '1D');
      if (!ohlcv || ohlcv.length === 0) return null;
      
      const tech = calculateTechnicalScore(ohlcv);
      
      let type: SignalType = 'hold';
      if (tech.score >= 80) type = 'strong_buy';
      else if (tech.score >= 60) type = 'buy';
      else if (tech.score <= 20) type = 'strong_sell';
      else if (tech.score <= 40) type = 'sell';

      // Only return actionable signals
      if (type === 'hold') return null;

      return {
        id: asset.symbol,
        symbol: asset.symbol,
        type,
        priceAtSignal: asset.price,
        date: new Date().toISOString(),
        score: tech.score,
        reasons: tech.reasons // Add reasons for UI explanation
      };
    });

    const results = await Promise.all(signalsPromises);
    const validSignals = results.filter(r => r !== null);
    
    // Sort by signal strength (strongest buy or strongest sell first)
    validSignals.sort((a, b) => {
      const diffA = Math.abs((a!.score) - 50);
      const diffB = Math.abs((b!.score) - 50);
      return diffB - diffA;
    });

    return NextResponse.json({ success: true, data: validSignals });
  } catch (error) {
    console.error('Signals API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}
