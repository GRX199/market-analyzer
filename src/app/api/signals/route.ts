import { NextResponse } from 'next/server';
import { SignalType } from '@/types/analysis';
import { getAssetList, getOHLCV, getMarketTypeForSymbol } from '@/services/market-data';
import { getFundamentalData } from '@/services/fundamental-data';
import { getNewsBySymbol } from '@/services/news-service';
import { calculateTechnicalScore } from '@/lib/analysis/technical';
import { analyzeForexFundamentals, analyzeStockFundamentals, analyzeCryptoFundamentals } from '@/lib/analysis/fundamental';
import { analyzeSentiment } from '@/lib/analysis/sentiment';
import { calculateFinalScore } from '@/lib/analysis/scoring';
import {
  parseMarketType,
  parseSignalMode,
  parseSupportedSymbol,
  parseTimeframe,
} from '@/lib/market-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol');
    const symbol = rawSymbol === null ? null : parseSupportedSymbol(rawSymbol);
    const marketParam = searchParams.get('market');
    const timeframe = parseTimeframe(searchParams.get('timeframe'));
    const mode = parseSignalMode(searchParams.get('mode'));
    const parsedMarket = parseMarketType(marketParam, {
      allowAll: true,
      optional: true,
    });
    if (
      (rawSymbol !== null && symbol === null)
      || timeframe === null
      || mode === null
      || parsedMarket === null
    ) {
      return NextResponse.json(
        { success: false, error: 'Unsupported symbol, market, timeframe, or mode' },
        { status: 400 },
      );
    }
    const targetMarket = parsedMarket === 'all' ? undefined : parsedMarket;

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
      
      let finalScore = technical.score;
      let finalSignal = 'hold';
      
      if (mode === 'combined') {
        let fundamental;
        if (marketType === 'forex') fundamental = analyzeForexFundamentals(fundamentalData as any);
        else if (marketType === 'stocks') fundamental = analyzeStockFundamentals(fundamentalData as any);
        else fundamental = analyzeCryptoFundamentals(fundamentalData as any);

        const sentiment = analyzeSentiment(newsData);
        
        const finalAnalysis = calculateFinalScore(
          symbol,
          marketType,
          ohlcv[ohlcv.length - 1].close,
          technical,
          fundamental,
          sentiment
        );
        finalScore = finalAnalysis.finalScore;
        finalSignal = finalAnalysis.signal;
      } else {
        if (technical.score >= 80) finalSignal = 'strong_buy';
        else if (technical.score >= 60) finalSignal = 'buy';
        else if (technical.score <= 20) finalSignal = 'strong_sell';
        else if (technical.score <= 40) finalSignal = 'sell';
      }

      return NextResponse.json({
        success: true,
        data: [{
          id: symbol,
          symbol,
          type: finalSignal,
          priceAtSignal: ohlcv[ohlcv.length - 1].close,
          date: new Date().toISOString(),
          score: finalScore
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
        const lastCandle = ohlcv[ohlcv.length - 1];
        const entryPrice = lastCandle.close;
        
        let finalScore = technical.score;
        let finalSignal = 'hold';
        if (technical.score >= 80) finalSignal = 'strong_buy';
        else if (technical.score >= 60) finalSignal = 'buy';
        else if (technical.score <= 20) finalSignal = 'strong_sell';
        else if (technical.score <= 40) finalSignal = 'sell';
        let finalReasons = technical.reasons;
        let stopLoss = 0;
        let takeProfit = 0;
        let supportLevel = 0;
        let resistanceLevel = 0;
        
        // ATR-based TP/SL constraints
        const atrValue = technical.atr.value;
        const maxSlDistance = Math.min(atrValue * 1.5, entryPrice * 0.03); // 1.5× ATR, capped at 3%
        const defaultTpDistance = maxSlDistance * 1.5; // Target 1:1.5 R:R
        const maxLevelDistance = entryPrice * 0.03; // Only consider S/R within 3%

        // Find nearest valid support/resistance (within reasonable range)
        const nearSupports = technical.supportResistance
          .filter(sr => sr.type === 'support' && sr.price < entryPrice && (entryPrice - sr.price) <= maxLevelDistance)
          .sort((a, b) => b.price - a.price);
        const nearResistances = technical.supportResistance
          .filter(sr => sr.type === 'resistance' && sr.price > entryPrice && (sr.price - entryPrice) <= maxLevelDistance)
          .sort((a, b) => a.price - b.price);
        
        supportLevel = nearSupports.length > 0 ? nearSupports[0].price : 0;
        resistanceLevel = nearResistances.length > 0 ? nearResistances[0].price : 0;
        
        // Fallback to pivot points if within range
        if (supportLevel === 0) {
          const s1 = technical.pivotPoints.s1;
          if (s1 > 0 && s1 < entryPrice && (entryPrice - s1) <= maxLevelDistance) supportLevel = s1;
        }
        if (resistanceLevel === 0) {
          const r1 = technical.pivotPoints.r1;
          if (r1 > entryPrice && (r1 - entryPrice) <= maxLevelDistance) resistanceLevel = r1;
        }

        if (mode === 'combined') {
          let fundamental;
          if (asset.marketType === 'forex') fundamental = analyzeForexFundamentals(fundamentalData as any);
          else if (asset.marketType === 'stocks') fundamental = analyzeStockFundamentals(fundamentalData as any);
          else fundamental = analyzeCryptoFundamentals(fundamentalData as any);

          const sentiment = analyzeSentiment(newsData);
          
          const finalAnalysis = calculateFinalScore(
            asset.symbol,
            asset.marketType,
            entryPrice,
            technical,
            fundamental,
            sentiment
          );
          finalScore = finalAnalysis.finalScore;
          finalSignal = finalAnalysis.signal;
          finalReasons = finalAnalysis.reasons;
          stopLoss = finalAnalysis.stopLoss;
          takeProfit = finalAnalysis.takeProfit;
          supportLevel = finalAnalysis.supportLevel;
          resistanceLevel = finalAnalysis.resistanceLevel;
        } else {
          if (technical.score >= 80) finalSignal = 'strong_buy';
          else if (technical.score >= 60) finalSignal = 'buy';
          else if (technical.score <= 20) finalSignal = 'strong_sell';
          else if (technical.score <= 40) finalSignal = 'sell';
          
          // Calculate TP/SL for technical-only mode (same ATR-based logic)
          if (finalSignal === 'buy' || finalSignal === 'strong_buy') {
            stopLoss = supportLevel > 0 
              ? supportLevel - (atrValue * 0.2) 
              : entryPrice - maxSlDistance;
            const slDist = entryPrice - stopLoss;
            takeProfit = (resistanceLevel > 0 && (resistanceLevel - entryPrice) >= slDist)
              ? resistanceLevel 
              : entryPrice + Math.max(defaultTpDistance, slDist * 1.5);
          } else if (finalSignal === 'sell' || finalSignal === 'strong_sell') {
            stopLoss = resistanceLevel > 0 
              ? resistanceLevel + (atrValue * 0.2) 
              : entryPrice + maxSlDistance;
            const slDist = stopLoss - entryPrice;
            takeProfit = (supportLevel > 0 && (entryPrice - supportLevel) >= slDist)
              ? supportLevel 
              : entryPrice - Math.max(defaultTpDistance, slDist * 1.5);
          }
        }

        // Only return actionable signals
        if (finalSignal === 'hold') return null;

        // Calculate Risk:Reward ratio
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

        return {
          id: `${asset.symbol}-${Date.now()}`,
          symbol: asset.symbol,
          type: finalSignal,
          priceAtSignal: entryPrice,
          date: new Date().toISOString(),
          score: finalScore,
          reasons: finalReasons,
          entryPrice,
          stopLoss,
          takeProfit,
          supportLevel,
          resistanceLevel,
          riskRewardRatio,
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
