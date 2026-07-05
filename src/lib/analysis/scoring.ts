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
  let supportLevel = 0;
  let resistanceLevel = 0;
  
  if (technical.supportResistance.length > 0) {
    const supports = technical.supportResistance.filter(sr => sr.type === 'support');
    const resistances = technical.supportResistance.filter(sr => sr.type === 'resistance');
    
    if (supports.length > 0) supportLevel = supports[0].price;
    if (resistances.length > 0) resistanceLevel = resistances[resistances.length - 1].price; // Nearest resistance
  } else {
    // Fallback to pivot points
    supportLevel = technical.pivotPoints.s1;
    resistanceLevel = technical.pivotPoints.r1;
  }

  // Fictional Stop Loss / Take Profit for educational demonstration
  let stopLoss = 0;
  let takeProfit = 0;
  const currentPrice = technical.movingAverages[0].value; // Approx close price

  if (signal === 'buy' || signal === 'strong_buy') {
    stopLoss = supportLevel > 0 ? supportLevel * 0.99 : currentPrice * 0.95;
    takeProfit = resistanceLevel > currentPrice ? resistanceLevel : currentPrice * 1.1;
  } else if (signal === 'sell' || signal === 'strong_sell') {
    stopLoss = resistanceLevel > 0 ? resistanceLevel * 1.01 : currentPrice * 1.05;
    takeProfit = supportLevel > 0 && supportLevel < currentPrice ? supportLevel : currentPrice * 0.9;
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
