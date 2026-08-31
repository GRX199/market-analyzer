import type { OHLCV } from '@/types/market';

export type StrategyType = 'rsi' | 'macd_crossover' | 'sma_crossover';

export interface StrategyParams {
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  smaFast?: number;
  smaSlow?: number;
}

export interface BacktestConfig {
  initialCapital: number;
  positionSizePct: number;
  feePct: number;
  slippagePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  periodsPerYear: number;
}

export interface BacktestResult {
  trades: Trade[];
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  profitFactor: number;
  expectancy: number;
  totalFees: number;
  equityCurve: { time: number; value: number; drawdown: number }[];
  initialCapital: number;
  finalCapital: number;
  config: BacktestConfig;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  quantity: number;
  notional: number;
  fees: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: 'signal' | 'stop_loss' | 'take_profit' | 'end_of_data';
  status: 'open' | 'closed';
}

type Signal = 'buy' | 'sell' | null;
type NormalizedOHLCV = Omit<OHLCV, 'time'> & { time: number };

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  positionSizePct: 0.2,
  feePct: 0.001,
  slippagePct: 0.0005,
  stopLossPct: 0.02,
  takeProfitPct: 0.03,
  periodsPerYear: 252,
};

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toTimestamp(time: string | number): number {
  const parsed = typeof time === 'number' ? time : new Date(time).getTime();
  // Market providers in this project return Unix seconds, while Date and the
  // backtest UI use milliseconds.
  const timestamp = typeof time === 'number' && Math.abs(parsed) < 10_000_000_000
    ? parsed * 1_000
    : parsed;
  if (!Number.isFinite(timestamp)) {
    throw new Error('Historical data contains an invalid timestamp.');
  }
  return timestamp;
}

function normalizeData(data: OHLCV[]): NormalizedOHLCV[] {
  return data
    .filter((candle) => (
      [candle.open, candle.high, candle.low, candle.close].every(isFinitePositive)
      && candle.high >= Math.max(candle.open, candle.close)
      && candle.low <= Math.min(candle.open, candle.close)
    ))
    .map((candle) => ({ ...candle, time: toTimestamp(candle.time) }))
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function validateInteger(value: number, name: string, minimum = 1): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}.`);
  }
}

function resolveConfig(config: Partial<BacktestConfig> | number): BacktestConfig {
  const overrides = typeof config === 'number' ? { initialCapital: config } : config;
  const resolved = { ...DEFAULT_CONFIG, ...overrides };

  if (!isFinitePositive(resolved.initialCapital)) {
    throw new Error('Initial capital must be greater than zero.');
  }
  if (!isFinitePositive(resolved.positionSizePct) || resolved.positionSizePct > 1) {
    throw new Error('Position size must be greater than 0% and at most 100%.');
  }
  for (const [name, value] of [
    ['Fee', resolved.feePct],
    ['Slippage', resolved.slippagePct],
    ['Stop loss', resolved.stopLossPct],
    ['Take profit', resolved.takeProfitPct],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`${name} must be between 0% and 100%.`);
    }
  }
  validateInteger(resolved.periodsPerYear, 'Periods per year', 2);

  return resolved;
}

function calculateSMA(data: number[], period: number): (number | null)[] {
  const result = Array<number | null>(data.length).fill(null);
  let rollingSum = 0;

  for (let i = 0; i < data.length; i += 1) {
    rollingSum += data[i];
    if (i >= period) rollingSum -= data[i - period];
    if (i >= period - 1) result[i] = rollingSum / period;
  }

  return result;
}

function calculateEMA(data: (number | null)[], period: number): (number | null)[] {
  const result = Array<number | null>(data.length).fill(null);
  const seed: number[] = [];
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    if (value === null) continue;

    if (previous === null) {
      seed.push(value);
      if (seed.length === period) {
        previous = seed.reduce((sum, item) => sum + item, 0) / period;
        result[i] = previous;
      }
      continue;
    }

    previous = ((value - previous) * multiplier) + previous;
    result[i] = previous;
  }

  return result;
}

function calculateRSI(data: number[], period: number): (number | null)[] {
  const result = Array<number | null>(data.length).fill(null);
  if (data.length <= period) return result;

  let averageGain = 0;
  let averageLoss = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = data[i] - data[i - 1];
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  const valueFor = () => {
    if (averageGain === 0 && averageLoss === 0) return 50;
    if (averageLoss === 0) return 100;
    if (averageGain === 0) return 0;
    return 100 - (100 / (1 + (averageGain / averageLoss)));
  };

  result[period] = valueFor();
  for (let i = period + 1; i < data.length; i += 1) {
    const change = data[i] - data[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    result[i] = valueFor();
  }

  return result;
}

function crossoverSignal(
  first: (number | null)[],
  second: (number | null)[],
  index: number,
): Signal {
  if (index < 1) return null;
  const firstNow = first[index];
  const secondNow = second[index];
  const firstBefore = first[index - 1];
  const secondBefore = second[index - 1];

  if (
    firstNow === null
    || secondNow === null
    || firstBefore === null
    || secondBefore === null
  ) {
    return null;
  }
  if (firstBefore <= secondBefore && firstNow > secondNow) return 'buy';
  if (firstBefore >= secondBefore && firstNow < secondNow) return 'sell';
  return null;
}

function createSignalReader(
  closePrices: number[],
  strategy: StrategyType,
  params: StrategyParams,
): (index: number) => Signal {
  if (strategy === 'sma_crossover') {
    const fastPeriod = params.smaFast ?? 20;
    const slowPeriod = params.smaSlow ?? 50;
    validateInteger(fastPeriod, 'Fast SMA period', 2);
    validateInteger(slowPeriod, 'Slow SMA period', 3);
    if (fastPeriod >= slowPeriod) {
      throw new Error('Fast SMA period must be lower than slow SMA period.');
    }
    const fast = calculateSMA(closePrices, fastPeriod);
    const slow = calculateSMA(closePrices, slowPeriod);
    return (index) => crossoverSignal(fast, slow, index);
  }

  if (strategy === 'macd_crossover') {
    const fastPeriod = params.macdFast ?? 12;
    const slowPeriod = params.macdSlow ?? 26;
    const signalPeriod = params.macdSignal ?? 9;
    validateInteger(fastPeriod, 'Fast MACD period', 2);
    validateInteger(slowPeriod, 'Slow MACD period', 3);
    validateInteger(signalPeriod, 'MACD signal period', 2);
    if (fastPeriod >= slowPeriod) {
      throw new Error('Fast MACD period must be lower than slow MACD period.');
    }

    const source = closePrices.map((price) => price);
    const fast = calculateEMA(source, fastPeriod);
    const slow = calculateEMA(source, slowPeriod);
    const macd = fast.map((value, index) => (
      value === null || slow[index] === null ? null : value - slow[index]!
    ));
    const signal = calculateEMA(macd, signalPeriod);
    return (index) => crossoverSignal(macd, signal, index);
  }

  const period = params.rsiPeriod ?? 14;
  const overbought = params.rsiOverbought ?? 70;
  const oversold = params.rsiOversold ?? 30;
  validateInteger(period, 'RSI period', 2);
  if (
    !Number.isFinite(overbought)
    || !Number.isFinite(oversold)
    || oversold <= 0
    || overbought >= 100
    || oversold >= overbought
  ) {
    throw new Error('RSI thresholds must satisfy 0 < oversold < overbought < 100.');
  }

  const rsi = calculateRSI(closePrices, period);
  return (index) => {
    if (index < 1 || rsi[index] === null || rsi[index - 1] === null) return null;
    if (rsi[index - 1]! <= oversold && rsi[index]! > oversold) return 'buy';
    if (rsi[index - 1]! >= overbought && rsi[index]! < overbought) return 'sell';
    return null;
  };
}

function getMinimumValidCandles(
  strategy: StrategyType,
  params: StrategyParams,
): number {
  if (strategy === 'sma_crossover') {
    return (params.smaSlow ?? 50) + 2;
  }
  if (strategy === 'macd_crossover') {
    return (params.macdSlow ?? 26) + (params.macdSignal ?? 9) + 1;
  }
  return (params.rsiPeriod ?? 14) + 3;
}

function executionPrice(basePrice: number, side: 'buy' | 'sell', slippagePct: number): number {
  return side === 'buy'
    ? basePrice * (1 + slippagePct)
    : basePrice * (1 - slippagePct);
}

function getRiskExit(
  position: Trade,
  candle: OHLCV,
  config: BacktestConfig,
): { price: number; reason: 'stop_loss' | 'take_profit' } | null {
  const isLong = position.type === 'buy';
  const stopPrice = config.stopLossPct > 0
    ? position.entryPrice * (isLong ? 1 - config.stopLossPct : 1 + config.stopLossPct)
    : null;
  const takeProfitPrice = config.takeProfitPct > 0
    ? position.entryPrice * (isLong ? 1 + config.takeProfitPct : 1 - config.takeProfitPct)
    : null;

  if (stopPrice !== null) {
    const openedPastStop = isLong ? candle.open <= stopPrice : candle.open >= stopPrice;
    if (openedPastStop) return { price: candle.open, reason: 'stop_loss' };
  }
  if (takeProfitPrice !== null) {
    const openedPastTarget = isLong
      ? candle.open >= takeProfitPrice
      : candle.open <= takeProfitPrice;
    if (openedPastTarget) return { price: candle.open, reason: 'take_profit' };
  }

  const touchedStop = stopPrice !== null
    && (isLong ? candle.low <= stopPrice : candle.high >= stopPrice);
  const touchedTarget = takeProfitPrice !== null
    && (isLong ? candle.high >= takeProfitPrice : candle.low <= takeProfitPrice);

  // Daily OHLC data cannot reveal which level was hit first. Choosing the stop
  // when both were touched avoids overstating the result.
  if (touchedStop) return { price: stopPrice!, reason: 'stop_loss' };
  if (touchedTarget) return { price: takeProfitPrice!, reason: 'take_profit' };
  return null;
}

function standardDeviation(values: number[], average: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce(
    (sum, value) => sum + ((value - average) ** 2),
    0,
  ) / values.length;
  return Math.sqrt(variance);
}

export function runBacktest(
  rawData: OHLCV[],
  strategy: StrategyType,
  params: StrategyParams = {},
  configInput: Partial<BacktestConfig> | number = {},
): BacktestResult {
  const config = resolveConfig(configInput);
  const data = normalizeData(rawData);

  const readSignal = createSignalReader(
    data.map((candle) => candle.close),
    strategy,
    params,
  );
  const minimumValidCandles = getMinimumValidCandles(strategy, params);
  if (data.length < minimumValidCandles) {
    const discardedCandles = rawData.length - data.length;
    throw new Error(
      `At least ${minimumValidCandles} valid historical candles are required; `
      + `${data.length} remained after filtering ${discardedCandles} invalid candles.`,
    );
  }
  const trades: Trade[] = [];
  const equityCurve: BacktestResult['equityCurve'] = [];
  let capital = config.initialCapital;
  const simulation: { currentPosition: Trade | null } = {
    currentPosition: null,
  };
  let peakEquity = config.initialCapital;
  let maxDrawdown = 0;
  let totalFees = 0;
  let tradeSequence = 0;

  const closePosition = (
    position: Trade,
    basePrice: number,
    time: number,
    reason: NonNullable<Trade['exitReason']>,
  ) => {
    const exitSide = position.type === 'buy' ? 'sell' : 'buy';
    const exitPrice = executionPrice(basePrice, exitSide, config.slippagePct);
    const grossPnl = position.type === 'buy'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;
    const exitFee = exitPrice * position.quantity * config.feePct;
    const entryFee = position.fees;
    const netPnl = grossPnl - entryFee - exitFee;

    capital += grossPnl - exitFee;
    totalFees += exitFee;
    position.exitTime = time;
    position.exitPrice = exitPrice;
    position.fees += exitFee;
    position.pnl = netPnl;
    position.pnlPercent = position.notional > 0 ? netPnl / position.notional : 0;
    position.exitReason = reason;
    position.status = 'closed';
    trades.push(position);
    simulation.currentPosition = null;
  };

  const openPosition = (
    direction: 'buy' | 'sell',
    candle: NormalizedOHLCV,
    index: number,
  ) => {
    const entryPrice = executionPrice(candle.open, direction, config.slippagePct);
    const notional = capital * config.positionSizePct;
    const quantity = notional / entryPrice;
    const entryFee = notional * config.feePct;
    capital -= entryFee;
    totalFees += entryFee;
    tradeSequence += 1;
    simulation.currentPosition = {
      id: `trade-${index}-${tradeSequence}`,
      type: direction,
      entryTime: candle.time,
      entryPrice,
      quantity,
      notional,
      fees: entryFee,
      status: 'open',
    };
  };

  const recordEquity = (
    candle: NormalizedOHLCV,
    exitedIntrabar?: { position: Trade; baseCapital: number },
  ) => {
    let closingEquity = capital;
    let favorableEquity = capital;
    let adverseEquity = capital;
    const position = simulation.currentPosition ?? exitedIntrabar?.position ?? null;
    if (position) {
      const markBaseCapital = simulation.currentPosition
        ? capital
        : exitedIntrabar?.baseCapital ?? capital;
      const closingPnl = position.type === 'buy'
        ? (candle.close - position.entryPrice) * position.quantity
        : (position.entryPrice - candle.close) * position.quantity;
      const favorableMark = position.type === 'buy' ? candle.high : candle.low;
      const adverseMark = position.type === 'buy' ? candle.low : candle.high;
      const favorablePnl = position.type === 'buy'
        ? (favorableMark - position.entryPrice) * position.quantity
        : (position.entryPrice - favorableMark) * position.quantity;
      const adversePnl = position.type === 'buy'
        ? (adverseMark - position.entryPrice) * position.quantity
        : (position.entryPrice - adverseMark) * position.quantity;
      // For a position that exited inside this candle, closing equity is the
      // actual realized result. Its OHLC excursion is still marked from the
      // pre-exit capital so a take-profit cannot erase an adverse move whose
      // ordering is unknowable from OHLC data alone.
      if (simulation.currentPosition) closingEquity = markBaseCapital + closingPnl;
      favorableEquity = markBaseCapital + favorablePnl;
      adverseEquity = markBaseCapital + adversePnl;
    }

    // OHLC does not reveal whether the favorable or adverse extreme came
    // first. For risk reporting, assume the favorable extreme established a
    // high-water mark before the adverse extreme and retain the worst
    // intrabar drawdown. The equity value itself remains close-to-close.
    peakEquity = Math.max(peakEquity, favorableEquity, closingEquity);
    const closingDrawdown = peakEquity > 0
      ? Math.max(0, (peakEquity - closingEquity) / peakEquity)
      : 0;
    const intrabarDrawdown = peakEquity > 0
      ? Math.max(0, (peakEquity - adverseEquity) / peakEquity)
      : 0;
    const drawdown = Math.max(closingDrawdown, intrabarDrawdown);
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    equityCurve.push({ time: candle.time, value: closingEquity, drawdown });
  };

  equityCurve.push({
    time: data[0].time,
    value: config.initialCapital,
    drawdown: 0,
  });

  for (let i = 1; i < data.length; i += 1) {
    const candle = data[i];
    // The signal only uses candles closed before this candle. Execution happens
    // at the next open, preventing same-candle look-ahead.
    const signal = readSignal(i - 1);

    const positionAtOpen = simulation.currentPosition;
    if (positionAtOpen && signal && signal !== positionAtOpen.type) {
      closePosition(positionAtOpen, candle.open, candle.time, 'signal');
    }
    if (!simulation.currentPosition && signal && capital > 0) {
      openPosition(signal, candle, i);
    }

    const positionAfterSignal = simulation.currentPosition;
    let exitedIntrabar: { position: Trade; baseCapital: number } | undefined;
    if (positionAfterSignal) {
      const riskExit = getRiskExit(positionAfterSignal, candle, config);
      if (riskExit) {
        exitedIntrabar = { position: positionAfterSignal, baseCapital: capital };
        closePosition(positionAfterSignal, riskExit.price, candle.time, riskExit.reason);
      }
    }

    recordEquity(candle, exitedIntrabar);
  }

  const finalPosition = simulation.currentPosition;
  if (finalPosition) {
    const finalCandle = data[data.length - 1];
    closePosition(finalPosition, finalCandle.close, finalCandle.time, 'end_of_data');
    peakEquity = Math.max(peakEquity, capital);
    const drawdown = peakEquity > 0 ? Math.max(0, (peakEquity - capital) / peakEquity) : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    const recordedDrawdown = equityCurve.at(-1)?.drawdown ?? 0;
    equityCurve[equityCurve.length - 1] = {
      time: finalCandle.time,
      value: capital,
      drawdown: Math.max(recordedDrawdown, drawdown),
    };
  }

  const winningTrades = trades.filter((trade) => (trade.pnl ?? 0) > 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => (trade.pnl ?? 0) < 0)
      .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0),
  );
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;
  const expectancy = trades.length > 0
    ? trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0) / trades.length
    : 0;
  const profitFactor = grossLoss > 0
    ? grossProfit / grossLoss
    : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;

  const periodReturns = equityCurve.slice(1).map((point, index) => {
    const previousEquity = equityCurve[index].value;
    return previousEquity > 0 ? (point.value - previousEquity) / previousEquity : 0;
  });
  const averageReturn = periodReturns.length > 0
    ? periodReturns.reduce((sum, value) => sum + value, 0) / periodReturns.length
    : 0;
  const deviation = standardDeviation(periodReturns, averageReturn);
  const sharpeRatio = deviation > 0
    ? (averageReturn / deviation) * Math.sqrt(config.periodsPerYear)
    : 0;

  return {
    trades,
    totalReturn: (capital - config.initialCapital) / config.initialCapital,
    maxDrawdown,
    winRate,
    sharpeRatio,
    profitFactor,
    expectancy,
    totalFees,
    equityCurve,
    initialCapital: config.initialCapital,
    finalCapital: capital,
    config,
  };
}
