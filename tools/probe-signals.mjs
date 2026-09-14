// Bounded read-only end-to-end probe, no website login bypass, writes or orders.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as analysis from '../src/lib/analysis/advanced-signals.ts';
import * as broker from '../src/lib/analysis/broker-snapshot.ts';
import * as binance from '../src/services/api/binance-signals.ts';
import * as constants from '../src/lib/constants.ts';
const yahoo = { mapSymbolToYahoo() { throw new Error('Probe must not use Yahoo'); }, fetchYahooSignalCandles() { throw new Error('Unexpected Yahoo fallback'); } };

const dependencies = { '@/lib/analysis/advanced-signals': analysis, '@/lib/analysis/broker-snapshot': broker,
  '@/services/api/binance-signals': binance, '@/lib/constants': constants, '@/services/api/yahoo-finance': yahoo };
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../src/services/advanced-signals.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, Date, URL, setTimeout, clearTimeout, require: id => {
  if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`); return dependencies[id];
} });

const script = `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('bridge',sys.argv[1]); bridge=importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
if not bridge.mt5.initialize(timeout=10000): raise SystemExit('MT5 not connected')
try:
 info=bridge.mt5.account_info()
 if info is None: raise SystemExit('No MT5 account')
 suffix='c' if info.currency=='USC' else 'm'
 result={}
 for base in ('XAUUSD','BTCUSD','EURUSD','GBPUSD'):
  try:
   s=bridge.snapshot(base+suffix,info); result[s['symbol']]=s
  except (ValueError,RuntimeError) as error: print(base+': '+str(error),file=sys.stderr)
 print(json.dumps(result))
finally: bridge.mt5.shutdown()
`;
const child = spawnSync(process.env.SIGNAL_PYTHON || 'python', ['-c', script, fileURLToPath(new URL('mt5/signal_market_bridge.py', import.meta.url))],
  { encoding: 'utf8', timeout: 45_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
if (child.status !== 0) throw new Error(`Read-only MT5 probe failed: ${child.error?.message ?? child.stderr}`);
if (child.stderr) process.stderr.write(child.stderr);
const snapshots = JSON.parse(child.stdout);
for (const source of ['mt5', 'market']) {
  const assets = exports.ADVANCED_UNIVERSE.filter(a => ['XAU/USD', 'BTC/USDT', 'EUR/USD', 'GBP/USD'].includes(a.symbol));
  const rows = await exports.scanAdvancedSignals(assets, 'intraday', { source, brokerSnapshots: snapshots });
  for (const r of rows) console.log(JSON.stringify({ source, symbol: r.displaySymbol, instrument: r.source.instrument,
    accountKind: r.source.accountKind, status: r.status, validUntil: r.expiresAt,
    frames: r.frames.map(f => ({ tf: f.timeframe, bars: f.bars, quality: f.quality, bias: f.bias, rsi: f.rsi, adx: f.adx })),
    reasons: r.reasons, candidate: r.plan, conditionalPlans: r.manualScenarios.length }));
}
