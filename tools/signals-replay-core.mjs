// Standalone research, never imported by an order worker. No filesystem/network access.
import { analyzeAdvancedSignal, FRAME_SECONDS, SIGNAL_MODEL_VERSION } from '../src/lib/analysis/advanced-signals.ts';

const TIMEFRAMES = ['15m', '1H', '4H'];
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateReplayDataset(dataset) {
  if (!dataset || !positive(dataset.capturedAt) || !positive(dataset.point) || !positive(dataset.tickSize)
    || !['XAU/USD', 'BTC/USDT'].includes(dataset.symbol)
    || !['XAUUSD', 'XAUUSDm', 'XAUUSDc', 'BTCUSD', 'BTCUSDm', 'BTCUSDc'].includes(dataset.instrument)
    || dataset.instrument.replace(/[mc]$/, '') !== dataset.symbol.replace('/USDT', 'USD').replace('/', '')
    || !['exness-metals', 'continuous'].includes(dataset.session)) throw new Error('Invalid replay identity/specification');
  for (const tf of TIMEFRAMES) {
    const bars = dataset.frames?.[tf];
    if (!Array.isArray(bars) || bars.length < 320 || bars.length > 20_000) throw new Error(`${tf}: history must contain 320–20000 bars`);
    let previous = 0;
    for (const bar of bars) {
      if (!bar || !Number.isInteger(bar.time) || bar.time <= previous || bar.time + FRAME_SECONDS[tf] > dataset.capturedAt
        || ![bar.open, bar.high, bar.low, bar.close].every(positive) || !nonnegative(bar.volume) || !nonnegative(bar.spread)
        || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) throw new Error(`${tf}: invalid/unclosed/duplicate/unordered candle`);
      previous = bar.time;
    }
  }
  return dataset;
}

/** Binary search the last CLOSED bar at this historical decision instant. */
export function closedFramesAt(dataset, decisionTime, count = 320) {
  return TIMEFRAMES.map(timeframe => {
    const bars = dataset.frames[timeframe], seconds = FRAME_SECONDS[timeframe];
    let low = 0, high = bars.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (bars[mid].time + seconds <= decisionTime) low = mid + 1; else high = mid;
    }
    return { timeframe, session: dataset.session, candles: bars.slice(Math.max(0, low - count), low) };
  });
}

export function replayMetrics(trades) {
  let total = 0, peak = 0, drawdown = 0, grossWin = 0, grossLoss = 0;
  for (const trade of trades) {
    total += trade.netR; peak = Math.max(peak, total); drawdown = Math.max(drawdown, peak - total);
    grossWin += Math.max(0, trade.netR); grossLoss += Math.max(0, -trade.netR);
  }
  return { trades: trades.length, netR: total, expectancyR: trades.length ? total / trades.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    winRate: trades.length ? trades.filter(t => t.netR > 0).length / trades.length : null,
    maxClosedTradeDrawdownR: drawdown, // NOT account/floating drawdown or compounded return.
    endOfFoldExits: trades.filter(t => t.exitReason === 'end_of_fold').length,
    ambiguousStopFirstExits: trades.filter(t => t.exitReason === 'ambiguous_stop_first').length };
}

export function replayAdvancedSignals(dataset, options) {
  validateReplayDataset(dataset);
  const { from, to, costs, maxHoldingBars = 48, analyze = analyzeAdvancedSignal } = options;
  if (!positive(from) || !positive(to) || from >= to || to > dataset.capturedAt || !Number.isInteger(maxHoldingBars) || maxHoldingBars < 1 || maxHoldingBars > 96
    || !costs || !positive(costs.spreadFloorPrice) || !positive(costs.multiplier)
    || ![costs.feeBpsPerSide, costs.slippageBpsPerSide, costs.holdingBpsPerDay].every(nonnegative)) throw new Error('Explicit valid period/cost assumptions required');
  const bars = dataset.frames['15m'], trades = [], counts = {}, reasons = {};
  const add = name => { counts[name] = (counts[name] ?? 0) + 1; };
  const meta = { symbol: dataset.symbol, displaySymbol: dataset.symbol.replace('/USDT', '/USD'), name: dataset.instrument,
    marketType: dataset.symbol === 'XAU/USD' ? 'forex' : 'crypto',
    source: { provider: 'MT5 historical replay', instrument: dataset.instrument, isProxy: false, kind: 'broker', note: 'Historical bid OHLC; assumed costs, not executable quotes.' } };
  const feeRate = costs.feeBpsPerSide / 10_000 * costs.multiplier;
  const slipRate = costs.slippageBpsPerSide / 10_000 * costs.multiplier;
  const holdingRate = costs.holdingBpsPerDay / 10_000 * costs.multiplier;
  let position = null, lastBar = null;
  const round = (value, up) => (up ? Math.ceil(value / dataset.tickSize - 1e-9) : Math.floor(value / dataset.tickSize + 1e-9)) * dataset.tickSize;
  function close(exitQuote, at, reason) {
    const p = position;
    const exit = round(exitQuote * (1 - p.direction * slipRate), p.direction < 0);
    const commissionPrice = (p.entry + exit) * feeRate;
    const holdingPrice = p.entry * holdingRate * Math.max(0, at - p.entryTime) / 86400;
    const netR = (p.direction * (exit - p.entry) - commissionPrice - holdingPrice) / p.risk;
    if (![exit, commissionPrice, holdingPrice, netR].every(Number.isFinite) || exit <= 0) throw new Error('Invalid simulated fill/P&L');
    trades.push({ signalTime: p.signalTime, entryTime: p.entryTime, exitTime: at, side: p.direction > 0 ? 'buy' : 'sell',
      entry: p.entry, stopLoss: p.stop, takeProfit: p.target, exit, exitReason: reason, unitRisk: p.risk, commissionPrice, holdingPrice, netR });
    position = null;
  }
  function manage(bar, spread) {
    const p = position, buy = p.direction > 0;
    const offset = buy ? 0 : spread;
    const open = bar.open + offset, high = bar.high + offset, low = bar.low + offset;
    if (buy ? open <= p.stop : open >= p.stop) { close(open, bar.time, 'gap_stop'); return; }
    if (buy ? open >= p.target : open <= p.target) { close(p.target, bar.time, 'gap_target_capped'); return; }
    const stop = buy ? low <= p.stop : high >= p.stop;
    const target = buy ? high >= p.target : low <= p.target;
    // Intrabar timing unknown. Charge holding provision through the full bar conservatively.
    if (stop) { close(p.stop, bar.time + 900, target ? 'ambiguous_stop_first' : 'stop'); return; }
    if (target) { close(p.target, bar.time + 900, 'target'); return; }
    if (bar.time + 900 - p.entryTime >= maxHoldingBars * 900) close(bar.close + offset, bar.time + 900, 'time_limit');
  }
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i], previous = bars[i - 1];
    if (bar.time < from || bar.time + 900 > to) continue;
    lastBar = { bar, spread: Math.max(costs.spreadFloorPrice, previous.spread * dataset.point) * costs.multiplier };
    add('barsInFold');
    // The current bar's spread/high/low/close must not decide its own entry.
    const spread = lastBar.spread;
    if (position) { manage(bar, spread); add('heldAtOpen'); continue; }
    const decision = previous.time + 900;
    if (bar.time !== decision) { add('gapBeforeEntry'); continue; }
    const frames = closedFramesAt(dataset, decision);
    if (frames.some(f => f.candles.length < 320)) { add('warmupIncomplete'); continue; }
    const signal = analyze(meta, 'intraday', frames, decision * 1000);
    add(`signal:${signal.status}`);
    if (signal.status !== 'candidate' || !signal.plan) {
      const reason = signal.reasons?.[0] ?? signal.status; reasons[reason] = (reasons[reason] ?? 0) + 1; continue;
    }
    const plan = signal.plan, buy = plan.side === 'buy', direction = buy ? 1 : -1;
    if (!['buy', 'sell'].includes(plan.side) || ![plan.entry, plan.stopLoss, plan.takeProfit].every(positive)) throw new Error('Invalid candidate plan');
    const entryQuote = bar.open + (buy ? spread : 0), closingQuote = bar.open + (buy ? 0 : spread);
    const entry = round(entryQuote * (1 + direction * slipRate), buy);
    // Round toward worse risk/reward; do not move targets further away to pass the gate.
    const stop = round(plan.stopLoss, !buy), target = round(plan.takeProfit, !buy);
    const risk = direction * (entry - stop), reward = direction * (target - entry);
    if (!positive(entry) || !positive(stop) || !positive(target) || risk <= 0 || reward <= 0
      || direction * (closingQuote - stop) <= 0 || direction * (target - closingQuote) <= 0 || reward / risk < 1.5 - 1e-8) { add('entryGeometryRejected'); continue; }
    position = { signalTime: decision, entryTime: bar.time, entry, stop, target, risk, direction };
    add('entries');
    manage(bar, spread);
  }
  if (position && lastBar) close(lastBar.bar.close + (position.direction < 0 ? lastBar.spread : 0), lastBar.bar.time + 900, 'end_of_fold');
  return { modelVersion: SIGNAL_MODEL_VERSION, from, to, costs: { ...costs }, counts, reasons, metrics: replayMetrics(trades), trades,
    profitabilityVerified: false, readyForReal: false };
}
