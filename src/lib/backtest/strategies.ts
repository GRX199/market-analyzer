import { OHLCV } from '@/types/market';

export type StrategyType = 'rsi' | 'macd_crossover' | 'sma_crossover';

export interface BacktestResult {
  trades: Trade[];
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  equityCurve: { time: number; value: number; drawdown: number }[];
  initialCapital: number;
  finalCapital: number;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed';
}

interface StrategyParams {
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  smaFast?: number;
  smaSlow?: number;
}

// Basic SMA calculation helper
function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  return result;
}

// Basic RSI calculation helper
function calculateRSI(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    
    const change = data[i] - data[i - 1];
    if (i <= period) {
      if (change > 0) gains += change;
      if (change < 0) losses -= change;
      if (i < period) {
        result.push(null);
      } else {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
      continue;
    }

    // Smoothed moving average for RSI
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? -change : 0;
    
    const prevGain = gains / period; // Approximation, proper Wilder's uses smoothed
    const prevLoss = losses / period;
    
    // Wilder's Smoothing
    const smoothedGain = ((prevGain * (period - 1)) + currentGain) / period;
    const smoothedLoss = ((prevLoss * (period - 1)) + currentLoss) / period;
    
    gains = smoothedGain * period; // Store total for next iteration
    losses = smoothedLoss * period;

    const rs = smoothedLoss === 0 ? 100 : smoothedGain / smoothedLoss;
    result.push(100 - (100 / (1 + rs)));
  }
  return result;
}


export function runBacktest(
  data: OHLCV[],
  strategy: StrategyType,
  params: StrategyParams = {},
  initialCapital: number = 10000
): BacktestResult {
  const trades: Trade[] = [];
  const equityCurve: { time: number; value: number; drawdown: number }[] = [];
  let capital = initialCapital;
  let currentPosition: Trade | null = null;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;

  const closePrices = data.map(d => d.close);
  let buySignal = false;
  let sellSignal = false;

  // Pre-calculate indicators based on strategy
  let smasFast: (number | null)[] = [];
  let smasSlow: (number | null)[] = [];
  let rsis: (number | null)[] = [];

  if (strategy === 'sma_crossover') {
    smasFast = calculateSMA(closePrices, params.smaFast || 20);
    smasSlow = calculateSMA(closePrices, params.smaSlow || 50);
  } else if (strategy === 'rsi') {
    rsis = calculateRSI(closePrices, params.rsiPeriod || 14);
  }

  for (let i = 1; i < data.length; i++) {
    const currentPrice = data[i].close;
    const currentTime = data[i].time;

    buySignal = false;
    sellSignal = false;

    // Evaluate Strategy
    if (strategy === 'sma_crossover') {
      const fastCurrent = smasFast[i];
      const slowCurrent = smasSlow[i];
      const fastPrev = smasFast[i-1];
      const slowPrev = smasSlow[i-1];

      if (fastCurrent !== null && slowCurrent !== null && fastPrev !== null && slowPrev !== null) {
        if (fastPrev <= slowPrev && fastCurrent > slowCurrent) buySignal = true;
        if (fastPrev >= slowPrev && fastCurrent < slowCurrent) sellSignal = true;
      }
    } else if (strategy === 'rsi') {
      const rsiCurrent = rsis[i];
      const rsiPrev = rsis[i-1];
      const overbought = params.rsiOverbought || 70;
      const oversold = params.rsiOversold || 30;

      if (rsiCurrent !== null && rsiPrev !== null) {
        // Cross up above oversold = Buy
        if (rsiPrev <= oversold && rsiCurrent > oversold) buySignal = true;
        // Cross down below overbought = Sell
        if (rsiPrev >= overbought && rsiCurrent < overbought) sellSignal = true;
      }
    }
    // TODO: Implement MACD

    // Execute Trades
    if (buySignal && !currentPosition) {
      currentPosition = {
        id: `trade-${i}`,
        type: 'buy',
        entryTime: typeof currentTime === 'string' ? new Date(currentTime).getTime() : currentTime,
        entryPrice: currentPrice,
        status: 'open'
      };
    } else if (sellSignal && currentPosition) {
      // Close Long Position
      const pnl = (currentPrice - currentPosition.entryPrice) * (capital / currentPosition.entryPrice);
      capital += pnl;
      
      currentPosition.exitTime = typeof currentTime === 'string' ? new Date(currentTime).getTime() : currentTime;
      currentPosition.exitPrice = currentPrice;
      currentPosition.pnl = pnl;
      currentPosition.pnlPercent = (currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice;
      currentPosition.status = 'closed';
      
      trades.push(currentPosition);
      currentPosition = null;
    }

    // Update Equity Curve
    const currentEquity = currentPosition 
      ? capital + (currentPrice - currentPosition.entryPrice) * (capital / currentPosition.entryPrice) 
      : capital;
      
    if (currentEquity > peakCapital) peakCapital = currentEquity;
    const currentDrawdown = peakCapital > 0 ? (peakCapital - currentEquity) / peakCapital : 0;
    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;

    equityCurve.push({
      time: typeof currentTime === 'string' ? new Date(currentTime).getTime() : currentTime,
      value: currentEquity,
      drawdown: currentDrawdown
    });
  }

  // Close any open position at the end
  if (currentPosition) {
      const currentPrice = data[data.length - 1].close;
      const pnl = (currentPrice - currentPosition.entryPrice) * (capital / currentPosition.entryPrice);
      capital += pnl;
      currentPosition.exitTime = typeof data[data.length - 1].time === 'string' ? new Date(data[data.length - 1].time).getTime() : (data[data.length - 1].time as number);
      currentPosition.exitPrice = currentPrice;
      currentPosition.pnl = pnl;
      currentPosition.pnlPercent = (currentPrice - currentPosition.entryPrice) / currentPosition.entryPrice;
      currentPosition.status = 'closed';
      trades.push(currentPosition);
  }

  // Calculate stats
  const closedTrades = trades.filter(t => t.status === 'closed');
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
  const totalReturn = (capital - initialCapital) / initialCapital;

  // Simple Sharpe (assuming 0% risk-free rate, daily data)
  let sharpeRatio = 0;
  if (equityCurve.length > 1) {
    const dailyReturns: number[] = [];
    for(let i=1; i<equityCurve.length; i++) {
        dailyReturns.push((equityCurve[i].value - equityCurve[i-1].value) / equityCurve[i-1].value);
    }
    const avgReturn = dailyReturns.reduce((a,b)=>a+b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a,b)=>a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    // Annualize (assuming 252 trading days)
    sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);
  }

  return {
    trades,
    totalReturn,
    maxDrawdown,
    winRate,
    sharpeRatio,
    equityCurve,
    initialCapital,
    finalCapital: capital
  };
}
