import { NextResponse } from 'next/server';
import { getAssetPrice, getOHLCV, getMarketTypeForSymbol } from '@/services/market-data';
import { getFundamentalData } from '@/services/fundamental-data';
import { getNewsBySymbol } from '@/services/news-service';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { analyzeForexFundamentals, analyzeStockFundamentals, analyzeCryptoFundamentals } from '@/lib/analysis/fundamental';
import { analyzeSentiment } from '@/lib/analysis/sentiment';
import { calculateFinalScore } from '@/lib/analysis/scoring';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const resolvedParams = await params;
    const symbol = decodeURIComponent(resolvedParams.symbol);
    const marketType = getMarketTypeForSymbol(symbol);
    
    const [assetData, ohlcvData, fundamentalData, newsData] = await Promise.all([
      getAssetPrice(symbol),
      getOHLCV(symbol),
      getFundamentalData(symbol, marketType),
      getNewsBySymbol(symbol)
    ]);

    if (!assetData || !ohlcvData || ohlcvData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Insufficient data for analysis' },
        { status: 404 }
      );
    }

    // Technical Analysis
    const technical = calculateTechnicalScore(ohlcvData);
    
    // Fundamental Analysis
    let fundamental;
    if (marketType === 'forex') fundamental = analyzeForexFundamentals(fundamentalData as any);
    else if (marketType === 'stocks') fundamental = analyzeStockFundamentals(fundamentalData as any);
    else fundamental = analyzeCryptoFundamentals(fundamentalData as any);

    // Sentiment Analysis
    const sentiment = analyzeSentiment(newsData);
    
    // Final Scoring
    const finalAnalysis = calculateFinalScore(
      symbol,
      marketType,
      technical,
      fundamental,
      sentiment
    );

    return NextResponse.json({ success: true, data: finalAnalysis });
  } catch (error) {
    console.error('Analysis API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}
