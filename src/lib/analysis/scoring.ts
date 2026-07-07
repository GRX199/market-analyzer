import { MarketType, TrendDirection } from '@/types/market';
import {
  TechnicalAnalysis,
  FundamentalAnalysis,
  SentimentAnalysis,
  FinalAnalysis,
  SignalType,
  RiskLevel
} from '@/types/analysis';
import { SCORE_WEIGHTS, SCORE_RANGES } from '@/lib/constants';

export function calculateFinalScore(
  symbol: string,
  marketType: MarketType,
  currentPrice: number,
  technical: TechnicalAnalysis,
  fundamental: FundamentalAnalysis,
  sentiment: SentimentAnalysis
): FinalAnalysis {
  
  // 1. Calculate Weighted Score
  const rawScore = 
    (technical.score * SCORE_WEIGHTS.technical) +
    (fundamental.score * SCORE_WEIGHTS.fundamental) +
    (sentiment.score * SCORE_WEIGHTS.sentiment);
  
  const finalScore = Math.round(rawScore);

  // 2. Determine Signal
  let signal: SignalType = 'hold';
  if (finalScore >= SCORE_RANGES.STRONG_BUY.min) signal = 'strong_buy';
  else if (finalScore >= SCORE_RANGES.BUY.min) signal = 'buy';
  else if (finalScore >= SCORE_RANGES.HOLD.min) signal = 'hold';
  else if (finalScore >= SCORE_RANGES.SELL.min) signal = 'sell';
  else signal = 'strong_sell';

  // 3. Determine Overall Trend
  let trend: TrendDirection = 'sideways';
  if (technical.score > 60) trend = 'bullish';
  else if (technical.score < 40) trend = 'bearish';

  // 4. Calculate Confidence (Alignment between Technicals and Fundamentals)
  // High confidence if Tech and Fund agree. Low if they diverge.
  const divergence = Math.abs(technical.score - fundamental.score);
  let confidence = 100 - (divergence * 0.8);
  
  // Penalize confidence if volume is low or volatility is extremely high
  if (technical.volumeMA.signal === 'below_average') confidence -= 10;
  if (technical.atr.volatility === 'high') confidence -= 15;
  
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  // 5. Assess Risk Level
  let riskLevel: RiskLevel = 'medium';
  
  let riskScore = 50;
  if (technical.atr.volatility === 'high') riskScore += 25;
  if (technical.atr.volatility === 'low') riskScore -= 15;
  
  // Crypto is inherently higher risk
  if (marketType === 'crypto') riskScore += 20;
  // Forex is high leverage usually
  if (marketType === 'forex') riskScore += 10;
  
  // High divergence = higher risk
  if (divergence > 30) riskScore += 15;

  if (riskScore > 75) riskLevel = 'high';
  else if (riskScore < 40) riskLevel = 'low';

  // 6. Consolidate Reasons & Factors
  const reasons = [
    `Technical Score: ${technical.score} (${SCORE_WEIGHTS.technical * 100}%)`,
    `Fundamental Score: ${fundamental.score} (${SCORE_WEIGHTS.fundamental * 100}%)`,
    `Sentiment Score: ${sentiment.score} (${SCORE_WEIGHTS.sentiment * 100}%)`,
  ];

  const buyFactors: string[] = [];
  const sellFactors: string[] = [];
  const riskFactors: string[] = [];

  // Sort technical reasons into buy/sell
  technical.reasons.forEach(r => {
    if (r.toLowerCase().includes('bullish') || r.toLowerCase().includes('buy') || r.toLowerCase().includes('above') || r.toLowerCase().includes('oversold')) {
      buyFactors.push(r);
    } else if (r.toLowerCase().includes('bearish') || r.toLowerCase().includes('sell') || r.toLowerCase().includes('below') || r.toLowerCase().includes('overbought')) {
      sellFactors.push(r);
    } else {
      reasons.push(r);
    }
  });

  fundamental.reasons.forEach(r => {
    if (fundamental.score > 55) buyFactors.push(r);
    else if (fundamental.score < 45) sellFactors.push(r);
    else reasons.push(r);
  });

  sentiment.reasons.forEach(r => {
    if (sentiment.score > 55) buyFactors.push(r);
    else if (sentiment.score < 45) sellFactors.push(r);
    else reasons.push(r);
  });

  // Compile risk factors
  if (riskLevel === 'high') riskFactors.push('Asset exhibits high volatility or market risk.');
  if (divergence > 30) riskFactors.push('Strong divergence between technicals and fundamentals.');
  if (technical.atr.volatility === 'high') riskFactors.push('Extreme price volatility detected (ATR).');
  if (marketType === 'crypto') riskFactors.push('Cryptocurrency markets are highly speculative and subject to extreme volatility.');

  // 7. Establish Key Levels (Educational purposes only)
  const atrValue = technical.atr.value;
  
  // Maximum SL distance: 1.5× ATR, capped at 3% of price
  // Target R:R of 1:1.5 minimum
  const maxSlDistance = Math.min(atrValue * 1.5, currentPrice * 0.03);
  const defaultTpDistance = maxSlDistance * 1.5; // 1:1.5 R:R minimum

  // Find nearest valid support/resistance levels (within 3% of current price)
  let supportLevel = 0;
  let resistanceLevel = 0;
  const maxLevelDistance = currentPrice * 0.03; // Only consider S/R within 3%
  
  if (technical.supportResistance.length > 0) {
    const supports = technical.supportResistance
      .filter(sr => sr.type === 'support' && sr.price < currentPrice && (currentPrice - sr.price) <= maxLevelDistance)
      .sort((a, b) => b.price - a.price); // Nearest support first
    const resistances = technical.supportResistance
      .filter(sr => sr.type === 'resistance' && sr.price > currentPrice && (sr.price - currentPrice) <= maxLevelDistance)
      .sort((a, b) => a.price - b.price); // Nearest resistance first
    
    if (supports.length > 0) supportLevel = supports[0].price;
    if (resistances.length > 0) resistanceLevel = resistances[0].price;
  }
  
  // Fallback to pivot points if within range
  if (supportLevel === 0) {
    const s1 = technical.pivotPoints.s1;
    if (s1 > 0 && s1 < currentPrice && (currentPrice - s1) <= maxLevelDistance) {
      supportLevel = s1;
    }
  }
  if (resistanceLevel === 0) {
    const r1 = technical.pivotPoints.r1;
    if (r1 > currentPrice && (r1 - currentPrice) <= maxLevelDistance) {
      resistanceLevel = r1;
    }
  }

  let stopLoss = 0;
  let takeProfit = 0;

  if (signal === 'buy' || signal === 'strong_buy') {
    // SL: Use nearest support if valid and close enough, else ATR-based
    if (supportLevel > 0) {
      stopLoss = supportLevel - (atrValue * 0.2); // Slightly below support
    } else {
      stopLoss = currentPrice - maxSlDistance;
    }
    // TP: Use nearest resistance if valid, else ATR-based R:R
    const slDistance = currentPrice - stopLoss;
    if (resistanceLevel > 0 && (resistanceLevel - currentPrice) >= slDistance) {
      takeProfit = resistanceLevel;
    } else {
      takeProfit = currentPrice + Math.max(defaultTpDistance, slDistance * 1.5);
    }
  } else if (signal === 'sell' || signal === 'strong_sell') {
    // SL: Use nearest resistance if valid and close enough, else ATR-based
    if (resistanceLevel > 0) {
      stopLoss = resistanceLevel + (atrValue * 0.2); // Slightly above resistance
    } else {
      stopLoss = currentPrice + maxSlDistance;
    }
    // TP: Use nearest support if valid, else ATR-based R:R
    const slDistance = stopLoss - currentPrice;
    if (supportLevel > 0 && (currentPrice - supportLevel) >= slDistance) {
      takeProfit = supportLevel;
    } else {
      takeProfit = currentPrice - Math.max(defaultTpDistance, slDistance * 1.5);
    }
  }

  return {
    symbol,
    marketType,
    technical,
    fundamental,
    sentiment,
    finalScore,
    signal,
    confidence,
    riskLevel,
    trend,
    reasons,
    buyFactors,
    sellFactors,
    riskFactors,
    supportLevel,
    resistanceLevel,
    stopLoss,
    takeProfit,
    timestamp: new Date().toISOString()
  };
}
