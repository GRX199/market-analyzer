// Explicit --mt5 mode reads history; default/help never contacts a terminal.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { replayAdvancedSignals, validateReplayDataset } from './signals-replay-core.mjs';

const mode = process.argv[2];
if (!['--mt5', '--input'].includes(mode) || mode === '--input' && !process.argv[3]) {
  console.log('Usage: node tools/run-signals-replay.mjs --mt5 | --input dataset.json');
  console.log('Read-only retrospective Signals v3 audit. Writes exclusive timestamped files under local-reports/ (ignored Git). Never places orders.');
} else {
  const policyText = readFileSync(new URL('./signals-replay-policy.json', import.meta.url), 'utf8');
  const policy = JSON.parse(policyText);
  const hash = content => createHash('sha256').update(content).digest('hex');
  const fingerprints = { policy: hash(policyText), analysis: hash(readFileSync(new URL('../src/lib/analysis/advanced-signals.ts', import.meta.url))),
    replay: hash(readFileSync(new URL('./signals-replay-core.mjs', import.meta.url))) };
  let input;
  if (mode === '--mt5') {
    const child = spawnSync(process.env.SIGNAL_PYTHON || 'python', [fileURLToPath(new URL('./mt5/collect_replay_data.py', import.meta.url))],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 24 * 1024 * 1024, windowsHide: true });
    if (child.status !== 0) throw new Error(`Read-only history export failed: ${child.error?.message ?? child.stderr}`);
    input = child.stdout;
  } else input = readFileSync(process.argv[3], 'utf8');
  const payload = JSON.parse(input);
  if (!payload || payload.readOnly !== true || !Array.isArray(payload.datasets) || payload.datasets.length < 1 || payload.datasets.length > 2) throw new Error('No valid bounded history datasets');
  const report = { createdAt: new Date().toISOString(), protocol: policy.protocol, policy, fingerprints, datasetHash: hash(input),
    collectorErrors: payload.errors ?? [], results: [], readyForReal: false, profitabilityVerified: false,
    limitations: [
      'Retrospective audit of the website model, NOT a backtest of MT5 robot profiles or a virgin forward/out-of-sample test.',
      'Uses only the last 320 closed native bars per timeframe. No parameter optimization. Fold dates fixed before scoring.',
      'Entry at the next contiguous M15 open. One position per symbol/fold. TP1 only, no partial TP2, breakeven or trailing.',
      'Bid OHLC only. Ask approximated with previous closed M15 spread and a declared floor; actual tick spread/latency unknown.',
      'Fees/slippage/holding cost are sensitivity provisions, NOT verified Exness billing. Holding provision is elapsed time, not actual rollover/triple swap.',
      'Costs x2 are a separate resimulation and may produce different trades; never compare them as identical-trade costs.',
      'SL-first on ambiguous bars, adverse stop gaps, favorable target gaps capped, adverse tick rounding. Fold-end positions force closed without future exits.',
      'R is simulated entry-to-stop price risk, not account return. Lot minimum, leverage/margin, portfolio collision and floating/account drawdown not modeled.',
      'Incomplete history and unknown historical session gaps can suppress setups. Data coverage is reported, never silently backfilled.'
    ] };
  for (const raw of payload.datasets) {
    const dataset = validateReplayDataset(raw);
    const end = Math.min(Math.floor(dataset.capturedAt / 900) * 900, dataset.frames['15m'].at(-1).time + 900);
    const start = end - policy.windowDays * 86400;
    const coverage = Object.fromEntries(Object.entries(dataset.frames).map(([tf, bars]) => [tf, { bars: bars.length, first: bars[0].time, last: bars.at(-1).time }]));
    for (const multiplier of policy.costMultipliers) for (const fold of policy.folds) {
      const from = Math.floor((start + (end - start) * fold.fromFraction) / 900) * 900;
      const to = Math.floor((start + (end - start) * fold.toFraction) / 900) * 900;
      const costs = { ...policy.costAssumptions, spreadFloorPrice: policy.costAssumptions.spreadFloorPrice[dataset.symbol], multiplier };
      const result = replayAdvancedSignals(dataset, { from, to, costs, maxHoldingBars: policy.maxHoldingBars });
      report.results.push({ instrument: dataset.instrument, accountKind: dataset.accountKind, fold: fold.name, multiplier, coverage, ...result });
      console.log(JSON.stringify({ instrument: dataset.instrument, fold: fold.name, costs: `${multiplier}x`, ...result.metrics, counts: result.counts }));
    }
  }
  const directory = fileURLToPath(new URL('../local-reports/', import.meta.url));
  mkdirSync(directory, { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/g, '-');
  const datasetPath = join(directory, `signals-dataset-${stamp}.json`), reportPath = join(directory, `signals-replay-${stamp}.json`);
  writeFileSync(datasetPath, input, { flag: 'wx' }); // Preserve exact reproducibility; never overwrite earlier evidence.
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ reportPath, datasetPath, profitabilityVerified: false, readyForReal: false }));
}
