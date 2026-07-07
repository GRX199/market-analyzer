import { OHLCV } from '@/types/market';
import {
  TechnicalAnalysis,
  MovingAverageData,
  RSIData,
  MACDData,
  BollingerBandsData,
  StochRSIData,
  ATRData,
  PivotPointData,
  SupportResistanceLevel,
  CandlestickPattern,
} from '@/types/analysis';

// ============ CALCULATION FUNCTIONS ============

export function calculateSMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const result: number[] = [];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  if (gains.length < period) return [50];

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function calculateMACD(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = calculateEMA(prices, fastPeriod);
  const ema26 = calculateEMA(prices, slowPeriod);
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const signalOffset = signalPeriod - 1;
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + signalOffset] - signalLine[i]);
  }
  return { macdLine, signalLine, histogram };
}

export function calculateBollingerBands(
  prices: number[],
  period = 20,
  multiplier = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance =
      slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper.push(sma + multiplier * stdDev);
    middle.push(sma);
    lower.push(sma - multiplier * stdDev);
  }
  return { upper, middle, lower };
}

export function calculateStochRSI(
  prices: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmoothing = 3,
  dSmoothing = 3
): { k: number[]; d: number[] } {
  const rsiValues = calculateRSI(prices, rsiPeriod);
  const stochRSI: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const lowest = Math.min(...slice);
    const highest = Math.max(...slice);
    const value =
      highest === lowest
        ? 50
        : ((rsiValues[i] - lowest) / (highest - lowest)) * 100;
    stochRSI.push(value);
  }
  const k = calculateSMA(stochRSI, kSmoothing);
  const d = calculateSMA(k, dSmoothing);
  return { k, d };
}

export function calculateATR(candles: OHLCV[], period = 14): number[] {
  const trueRanges: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }
  const atrValues: number[] = [];
  if (trueRanges.length < period)
    return [trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length];
  let atr =
    trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrValues.push(atr);
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    atrValues.push(atr);
  }
  return atrValues;
}

export function calculatePivotPoints(
  high: number,
  low: number,
  close: number
): PivotPointData {
  const pivot = (high + low + close) / 3;
  const range = high - low;
  return {
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + range,
    r3: pivot + 2 * range,
    s1: 2 * pivot - high,
    s2: pivot - range,
    s3: pivot - 2 * range,
  };
}

export function detectSupportResistance(
  candles: OHLCV[],
  windowSize = 5,
  clusterThreshold = 0.02
): SupportResistanceLevel[] {
  const swingHighs: { price: number; idx: number }[] = [];
  const swingLows: { price: number; idx: number }[] = [];

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= windowSize; j++) {
      if (
        candles[i].high <= candles[i - j].high ||
        candles[i].high <= candles[i + j].high
      )
        isHigh = false;
      if (
        candles[i].low >= candles[i - j].low ||
        candles[i].low >= candles[i + j].low
      )
        isLow = false;
    }
    if (isHigh) swingHighs.push({ price: candles[i].high, idx: i });
    if (isLow) swingLows.push({ price: candles[i].low, idx: i });
  }

  const cluster = (
    points: { price: number }[],
    type: 'support' | 'resistance'
  ): SupportResistanceLevel[] => {
    const levels: SupportResistanceLevel[] = [];
    const used = new Set<number>();
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const group = [points[i]];
      used.add(i);
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;
        if (
          Math.abs(points[i].price - points[j].price) / points[i].price <=
          clusterThreshold
        ) {
          group.push(points[j]);
          used.add(j);
        }
      }
      levels.push({
        price: group.reduce((s, p) => s + p.price, 0) / group.length,
        type,
        strength: group.length,
      });
    }
    return levels.sort((a, b) => b.strength - a.strength);
  };

  return [
    ...cluster(swingHighs, 'resistance'),
    ...cluster(swingLows, 'support'),
  ];
}

// ============ CANDLESTICK PATTERN DETECTION ============

function candleMetrics(c: OHLCV) {
  const body = Math.abs(c.close - c.open);
  const totalRange = c.high - c.low;
  const upperShadow = c.high - Math.max(c.open, c.close);
  const lowerShadow = Math.min(c.open, c.close) - c.low;
  const isBullish = c.close > c.open;
  return { body, totalRange, upperShadow, lowerShadow, isBullish };
}

export function detectCandlestickPatterns(
  candles: OHLCV[]
): CandlestickPattern[] {
  const patterns: CandlestickPattern[] = [];
  if (candles.length < 2) return patterns;

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const cm = candleMetrics(curr);
    const pm = candleMetrics(prev);

    // Doji
    if (cm.totalRange > 0 && cm.body <= cm.totalRange * 0.1) {
      patterns.push({
        name: 'Doji',
        type: 'neutral',
        confidence: 0.6,
        description:
          'Indecision candle — body is very small relative to range',
      });
    }

    // Hammer
    if (
      cm.totalRange > 0 &&
      cm.body > 0 &&
      cm.lowerShadow >= 2 * cm.body &&
      cm.upperShadow <= cm.body * 0.5 &&
      cm.body < cm.totalRange * 0.33
    ) {
      patterns.push({
        name: 'Hammer',
        type: 'bullish',
        confidence: 0.7,
        description:
          'Potential bullish reversal — long lower shadow with small body',
      });
    }

    // Shooting Star
    if (
      cm.totalRange > 0 &&
      cm.body > 0 &&
      cm.upperShadow >= 2 * cm.body &&
      cm.lowerShadow <= cm.totalRange * 0.1 &&
      cm.body < cm.totalRange * 0.33
    ) {
      patterns.push({
        name: 'Shooting Star',
        type: 'bearish',
        confidence: 0.7,
        description:
          'Potential bearish reversal — long upper shadow with small body',
      });
    }

    // Bullish Engulfing
    if (
      !pm.isBullish &&
      cm.isBullish &&
      curr.open < prev.close &&
      curr.close > prev.open &&
      cm.body > pm.body
    ) {
      patterns.push({
        name: 'Bullish Engulfing',
        type: 'bullish',
        confidence: 0.75,
        description:
          'Strong bullish reversal — current candle engulfs previous bearish candle',
      });
    }

    // Bearish Engulfing
    if (
      pm.isBullish &&
      !cm.isBullish &&
      curr.open > prev.close &&
      curr.close < prev.open &&
      cm.body > pm.body
    ) {
      patterns.push({
        name: 'Bearish Engulfing',
        type: 'bearish',
        confidence: 0.75,
        description:
          'Strong bearish reversal — current candle engulfs previous bullish candle',
      });
    }
  }

  return patterns;
}

// ============ TECHNICAL SCORE CALCULATION ============

export function calculateTechnicalScore(candles: OHLCV[]): TechnicalAnalysis {
  if (candles.length < 200) {
    const closes = candles.map((c) => c.close);
    const lastPrice = closes[closes.length - 1] || 100;
    return getDefaultTechnicalAnalysis(lastPrice);
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const lastPrice = closes[closes.length - 1];

  // Moving Averages
  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma100 = calculateSMA(closes, 100);
  const ma200 = calculateSMA(closes, 200);

  const maData: MovingAverageData[] = [
    {
      period: 20,
      value: ma20[ma20.length - 1],
      signal: lastPrice > ma20[ma20.length - 1] ? 'buy' : 'sell',
      priceRelation: lastPrice > ma20[ma20.length - 1] ? 'above' : 'below',
    },
    {
      period: 50,
      value: ma50[ma50.length - 1],
      signal: lastPrice > ma50[ma50.length - 1] ? 'buy' : 'sell',
      priceRelation: lastPrice > ma50[ma50.length - 1] ? 'above' : 'below',
    },
    {
      period: 100,
      value: ma100[ma100.length - 1],
      signal: lastPrice > ma100[ma100.length - 1] ? 'buy' : 'sell',
      priceRelation: lastPrice > ma100[ma100.length - 1] ? 'above' : 'below',
    },
    {
      period: 200,
      value: ma200[ma200.length - 1],
      signal: lastPrice > ma200[ma200.length - 1] ? 'buy' : 'sell',
      priceRelation: lastPrice > ma200[ma200.length - 1] ? 'above' : 'below',
    },
  ];

  // RSI
  const rsiValues = calculateRSI(closes);
  const rsiValue = rsiValues[rsiValues.length - 1] || 50;
  const rsiData: RSIData = {
    value: rsiValue,
    signal:
      rsiValue > 70 ? 'overbought' : rsiValue < 30 ? 'oversold' : 'neutral',
  };

  // MACD
  const macdResult = calculateMACD(closes);
  const macdLine =
    macdResult.macdLine[macdResult.macdLine.length - 1] || 0;
  const signalLine =
    macdResult.signalLine[macdResult.signalLine.length - 1] || 0;
  const histogram =
    macdResult.histogram[macdResult.histogram.length - 1] || 0;
  const prevHistogram =
    macdResult.histogram.length > 1
      ? macdResult.histogram[macdResult.histogram.length - 2]
      : 0;
  const macdData: MACDData = {
    macdLine,
    signalLine,
    histogram,
    signal:
      macdLine > signalLine
        ? 'bullish'
        : macdLine < signalLine
          ? 'bearish'
          : 'neutral',
    crossover:
      prevHistogram <= 0 && histogram > 0
        ? 'bullish_crossover'
        : prevHistogram >= 0 && histogram < 0
          ? 'bearish_crossover'
          : 'none',
  };

  // Bollinger Bands
  const bb = calculateBollingerBands(closes);
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbMiddle = bb.middle[bb.middle.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const bbRange = bbUpper - bbLower;
  let bbPosition: BollingerBandsData['position'] = 'middle';
  if (lastPrice > bbUpper) bbPosition = 'above_upper';
  else if (lastPrice > bbMiddle + bbRange * 0.3) bbPosition = 'near_upper';
  else if (lastPrice < bbLower) bbPosition = 'below_lower';
  else if (lastPrice < bbMiddle - bbRange * 0.3) bbPosition = 'near_lower';
  const bbData: BollingerBandsData = {
    upper: bbUpper,
    middle: bbMiddle,
    lower: bbLower,
    bandwidth: bbRange / bbMiddle,
    position: bbPosition,
  };

  // Stochastic RSI
  const stochResult = calculateStochRSI(closes);
  const stochK = stochResult.k[stochResult.k.length - 1] || 50;
  const stochD = stochResult.d[stochResult.d.length - 1] || 50;
  const stochData: StochRSIData = {
    k: stochK,
    d: stochD,
    signal:
      stochK > 80 ? 'overbought' : stochK < 20 ? 'oversold' : 'neutral',
  };

  // ATR
  const atrValues = calculateATR(candles);
  const atrValue = atrValues[atrValues.length - 1] || 0;
  const atrPercent = (atrValue / lastPrice) * 100;
  const atrData: ATRData = {
    value: atrValue,
    percentOfPrice: atrPercent,
    volatility: atrPercent > 3 ? 'high' : atrPercent > 1.5 ? 'medium' : 'low',
  };

  // Pivot Points
  const prevCandle = candles[candles.length - 2];
  const pivotData = calculatePivotPoints(
    prevCandle.high,
    prevCandle.low,
    prevCandle.close
  );

  // Support/Resistance
  const srLevels = detectSupportResistance(candles);

  // Candlestick Patterns (last 10 candles)
  const recentCandles = candles.slice(-10);
  const patterns = detectCandlestickPatterns(recentCandles);

  // Volume MA
  const volMA = calculateSMA(volumes, 20);
  const currentVol = volumes[volumes.length - 1];
  const avgVol = volMA[volMA.length - 1] || currentVol;

  // ============ TRADINGVIEW-STYLE QUANTITATIVE SCORING ============
  const reasons: string[] = [];
  
  // 1. Moving Averages (MA) Vote
  let maBuyVotes = 0;
  let maSellVotes = 0;
  let maTotalVotes = 0;

  // EMA for additional trend sensitivity
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema100 = calculateEMA(closes, 100);
  const ema200 = calculateEMA(closes, 200);
  
  const allMAs = [
    { name: 'SMA 20', val: ma20[ma20.length - 1] },
    { name: 'SMA 50', val: ma50[ma50.length - 1] },
    { name: 'SMA 100', val: ma100[ma100.length - 1] },
    { name: 'SMA 200', val: ma200[ma200.length - 1] },
    { name: 'EMA 20', val: ema20.length > 0 ? ema20[ema20.length - 1] : undefined },
    { name: 'EMA 50', val: ema50.length > 0 ? ema50[ema50.length - 1] : undefined },
    { name: 'EMA 100', val: ema100.length > 0 ? ema100[ema100.length - 1] : undefined },
    { name: 'EMA 200', val: ema200.length > 0 ? ema200[ema200.length - 1] : undefined },
  ];

  allMAs.forEach(ma => {
    if (ma.val !== undefined && !isNaN(ma.val)) {
      maTotalVotes++;
      if (lastPrice > ma.val) maBuyVotes++;
      else if (lastPrice < ma.val) maSellVotes++;
    }
  });

  const maRating = maTotalVotes > 0 ? ((maBuyVotes - maSellVotes) / maTotalVotes) : 0; // -1 to 1

  if (maRating >= 0.5) reasons.push('Moving Averages show strong bullish alignment.');
  else if (maRating <= -0.5) reasons.push('Moving Averages show strong bearish alignment.');
  else if (maRating > 0) reasons.push('Moving Averages lean slightly bullish.');
  else if (maRating < 0) reasons.push('Moving Averages lean slightly bearish.');

  // 2. Oscillators Vote
  let oscBuyVotes = 0;
  let oscSellVotes = 0;
  let oscTotalVotes = 0;

  // RSI Vote
  oscTotalVotes++;
  if (rsiValue < 30) {
    oscBuyVotes++;
    reasons.push('RSI indicates oversold conditions — potential bounce.');
  } else if (rsiValue > 70) {
    oscSellVotes++;
    reasons.push('RSI indicates overbought conditions — potential pullback.');
  }

  // Stochastic RSI Vote
  oscTotalVotes++;
  if (stochK < 20 && stochD < 20 && stochK > stochD) {
    oscBuyVotes++;
    reasons.push('StochRSI bullish crossover in oversold territory.');
  } else if (stochK > 80 && stochD > 80 && stochK < stochD) {
    oscSellVotes++;
    reasons.push('StochRSI bearish crossover in overbought territory.');
  }

  // MACD Vote
  oscTotalVotes++;
  if (macdLine > signalLine) oscBuyVotes++;
  else if (macdLine < signalLine) oscSellVotes++;
  
  if (macdData.crossover === 'bullish_crossover') reasons.push('MACD bullish crossover detected.');
  else if (macdData.crossover === 'bearish_crossover') reasons.push('MACD bearish crossover detected.');

  // Bollinger Bands Vote
  oscTotalVotes++;
  if (bbPosition === 'below_lower' || bbPosition === 'near_lower') {
    oscBuyVotes++;
    if (bbPosition === 'below_lower') reasons.push('Price below lower Bollinger Band — potential reversal.');
  } else if (bbPosition === 'above_upper' || bbPosition === 'near_upper') {
    oscSellVotes++;
    if (bbPosition === 'above_upper') reasons.push('Price above upper Bollinger Band — potentially overextended.');
  }

  const oscRating = oscTotalVotes > 0 ? ((oscBuyVotes - oscSellVotes) / oscTotalVotes) : 0; // -1 to 1

  // 3. Composite Technical Rating
  // Overall rating is the average of MA and Oscillator ratings
  let compositeRating = (maRating + oscRating) / 2; // -1 to 1

  // 4. Trend and Volume Confirmation Boosts (Modifiers)
  
  // Volume confirmation
  if (currentVol > avgVol * 1.5) {
    if (compositeRating > 0) {
      compositeRating = Math.min(1, compositeRating + 0.1);
      reasons.push('High volume confirms bullish momentum.');
    } else if (compositeRating < 0) {
      compositeRating = Math.max(-1, compositeRating - 0.1);
      reasons.push('High volume confirms bearish momentum.');
    }
  } else if (currentVol < avgVol * 0.5) {
    // Low volume softens the rating (less conviction)
    compositeRating = compositeRating * 0.8;
  }

  // Candlestick pattern confirmation
  const bullishPatterns = patterns.filter((p) => p.type === 'bullish');
  const bearishPatterns = patterns.filter((p) => p.type === 'bearish');
  
  if (bullishPatterns.length > 0) {
    reasons.push(`Bullish pattern detected: ${bullishPatterns[0].name}.`);
    if (compositeRating >= 0) compositeRating = Math.min(1, compositeRating + 0.1);
  } else if (bearishPatterns.length > 0) {
    reasons.push(`Bearish pattern detected: ${bearishPatterns[0].name}.`);
    if (compositeRating <= 0) compositeRating = Math.max(-1, compositeRating - 0.1);
  }

  // Convert -1 to 1 rating into 0 to 100 score
  let score = Math.round(((compositeRating + 1) / 2) * 100);
  
  // Clamp score to strictly 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    movingAverages: maData,
    rsi: rsiData,
    macd: macdData,
    bollingerBands: bbData,
    stochRSI: stochData,
    atr: atrData,
    pivotPoints: pivotData,
    supportResistance: srLevels.slice(0, 6),
    patterns,
    volumeMA: {
      current: currentVol,
      average: avgVol,
      signal: currentVol > avgVol ? 'above_average' : 'below_average',
    },
    score,
    reasons,
  };
}

function getDefaultTechnicalAnalysis(price: number): TechnicalAnalysis {
  return {
    movingAverages: [
      { period: 20, value: price * 0.99, signal: 'buy', priceRelation: 'above' },
      { period: 50, value: price * 0.97, signal: 'buy', priceRelation: 'above' },
      { period: 100, value: price * 0.95, signal: 'buy', priceRelation: 'above' },
      { period: 200, value: price * 0.93, signal: 'sell', priceRelation: 'below' },
    ],
    rsi: { value: 55, signal: 'neutral' },
    macd: { macdLine: 0.5, signalLine: 0.3, histogram: 0.2, signal: 'bullish', crossover: 'none' },
    bollingerBands: { upper: price * 1.05, middle: price, lower: price * 0.95, bandwidth: 0.1, position: 'middle' },
    stochRSI: { k: 55, d: 52, signal: 'neutral' },
    atr: { value: price * 0.02, percentOfPrice: 2, volatility: 'medium' },
    pivotPoints: { pivot: price, r1: price * 1.01, r2: price * 1.02, r3: price * 1.03, s1: price * 0.99, s2: price * 0.98, s3: price * 0.97 },
    supportResistance: [
      { price: price * 0.97, type: 'support', strength: 3 },
      { price: price * 1.03, type: 'resistance', strength: 3 },
    ],
    patterns: [],
    volumeMA: { current: 1000000, average: 900000, signal: 'above_average' },
    score: 58,
    reasons: ['Price above short-term moving averages.', 'RSI is neutral.', 'MACD shows mild bullish momentum.'],
  };
}
