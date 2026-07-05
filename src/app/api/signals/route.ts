import { NextResponse } from 'next/server';
import { SignalType } from '@/types/analysis';
import { getAssetList, getOHLCV, getMarketTypeForSymbol } from '@/services/market-data';
import { getFundamentalData } from '@/services/fundamental-data';
import { getNewsBySymbol } from '@/services/news-service';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { analyzeForexFundamentals, analyzeStockFundamentals, analyzeCryptoFundamentals } from '@/lib/analysis/fundamental';
import { analyzeSentiment } from '@/lib/analysis/sentiment';
import { calculateFinalScore } from '@/lib/analysis/scoring';
import { MarketType } from '@/types/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const marketParam = searchParams.get('market');
    const timeframe = searchParams.get('timeframe') || '1D';
    const targetMarket = (marketParam === 'all' || !marketParam) ? undefined : marketParam as MarketType;

    if (symbol) {
      // Analyze single symbol
      const marketType = getMarketTypeForSymbol(symbol);
      const [ohlcv, fundamentalData, newsData] = await Promise.all([
        getOHLCV(symbol, timeframe),
        getFundamentalData(symbol, marketType),
        getNewsBySymbol(symbol)
      ]);

      if (!ohlcv || ohlcv.length === 0) return NextResponse.json({ success: true, data: [] });
      
      const technical = calculateTechnicalScore(ohlcv);
      
      let fundamental;
      if (marketType === 'forex') fundamental = analyzeForexFundamentals(fundamentalData as any);
      else if (marketType === 'stocks') fundamental = analyzeStockFundamentals(fundamentalData as any);
      else fundamental = analyzeCryptoFundamentals(fundamentalData as any);

      const sentiment = analyzeSentiment(newsData);
      
      const finalAnalysis = calculateFinalScore(
        symbol,
        marketType,
        technical,
        fundamental,
        sentiment
      );

      return NextResponse.json({
        success: true,
        data: [{
          id: symbol,
          symbol,
          type: finalAnalysis.signal,
          priceAtSignal: ohlcv[ohlcv.length - 1].close,
          date: new Date().toISOString(),
          score: finalAnalysis.finalScore
        }]
      });
    }

    // Analyze top assets in the market to find opportunities
    const assets = await getAssetList(targetMarket);
    const topAssets = assets.slice(0, 20); // Take first 20 to provide more opportunities

    const signalsPromises = topAssets.map(async (asset) => {
      try {
        const [ohlcv, fundamentalData, newsData] = await Promise.all([
          getOHLCV(asset.symbol, timeframe),
          getFundamentalData(asset.symbol, asset.marketType),
          getNewsBySymbol(asset.symbol)
        ]);

        if (!ohlcv || ohlcv.length === 0) return null;
        
        const technical = calculateTechnicalScore(ohlcv);
        
        let fundamental;
        if (asset.marketType === 'forex') fundamental = analyzeForexFundamentals(fundamentalData as any);
        else if (asset.marketType === 'stocks') fundamental = analyzeStockFundamentals(fundamentalData as any);
        else fundamental = analyzeCryptoFundamentals(fundamentalData as any);

        const sentiment = analyzeSentiment(newsData);
        
        const finalAnalysis = calculateFinalScore(
          asset.symbol,
          asset.marketType,
          technical,
          fundamental,
          sentiment
        );

        // Only return actionable signals based on Overall Score
        if (finalAnalysis.signal === 'hold') return null;

        return {
          id: `${asset.symbol}-${Date.now()}`,
          symbol: asset.symbol,
          type: finalAnalysis.signal,
          priceAtSignal: ohlcv[ohlcv.length - 1].close,
          date: new Date().toISOString(),
          score: finalAnalysis.finalScore,
          reasons: finalAnalysis.reasons
        };
      } catch (err) {
        return null;
      }
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
