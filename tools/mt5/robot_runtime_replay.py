"""Offline audit of frozen runtime profiles against an already-saved MT5 dataset.

No MT5 initialization, data download, account access, orders, env loading or
worker startup. Imports only pure signal/simulation helpers from the sibling robot.
"""
from bisect import bisect_left, bisect_right
from dataclasses import asdict, replace
from datetime import datetime, timezone
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace

ROBOT = Path(__file__).resolve().parents[3] / 'mt5-robot'
sys.path.insert(0, str(ROBOT))
try:
    from robot_crypto_broker import load_broker_crypto_config
    from trading_core import calculate_atr
    from validate_forex_runtime_profiles import frozen_profiles, runtime_signal, simulate_fold, paired_cost_stress, r_summary
finally:
    sys.path.remove(str(ROBOT))

POLICY = {
    'protocol': 'frozen-robot-runtime-causal-spread-v1',
    'window_days': 90, 'folds': [('development', 0, .6), ('validation', .6, .8), ('test', .8, 1)],
    'spread_floor_price': {'XAUUSDm': .4, 'BTCUSDm': 20.0},
    'forex': {'max_spread_fraction': .0002, 'slippage_bps': .1, 'round_trip_fee_bps': .5},
    'crypto': {'max_spread_fraction': .0005, 'slippage_bps': 1.0, 'round_trip_fee_bps': 2.0},
    'holding_bps_per_day': 1.0, 'assumed_stops_level_points': 0,
    'warning': 'Sensitivity assumptions, not verified historical broker charges/specifications; not a live configuration',
}


def validate_bars(bars, *, seconds, captured_at):
    if not isinstance(bars, list) or len(bars) < 15 or len(bars) > 30000 or not math.isfinite(captured_at):
        raise ValueError('Invalid bounded history/capture time')
    previous = 0
    for bar in bars:
        values = [bar.get(key) for key in ('time', 'open', 'high', 'low', 'close')]
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0 for v in values):
            raise ValueError('Invalid historical OHLC/time')
        if (bar['time'] <= previous or bar['time'] + seconds > captured_at
            or bar['high'] < max(bar['open'], bar['close']) or bar['low'] > min(bar['open'], bar['close'])
            or not isinstance(bar.get('spread'), (int, float)) or not math.isfinite(bar['spread']) or bar['spread'] < 0):
            raise ValueError('Unclosed/duplicate/unordered candle or invalid spread')
        previous = bar['time']


def causal_spread_history(bars, *, point, floor_price):
    if not math.isfinite(point) or point <= 0 or not math.isfinite(floor_price) or floor_price <= 0:
        raise ValueError('Positive point and explicit spread floor required')
    # Replace only the cost proxy. Current-bar spread cannot select its own entry.
    return [{**bar, 'spread': max(floor_price / point, bars[i - 1]['spread'] if i else 0)} for i, bar in enumerate(bars)]


def runtime_series(bars, profile, signal_function=runtime_signal):
    # ATR is the same production function on the last 15 closed OHLC bars.
    atr = [None if i < 14 else calculate_atr(bars[i - 14:i + 1], 14) for i in range(len(bars))]
    cache = {}
    def signal(_series, index, _candidate):
        if index not in cache:
            if index < profile.history_bars - 1:
                cache[index] = None
            else:
                cache[index] = signal_function(bars[index - profile.history_bars + 1:index + 1], profile)
        return cache[index]
    return SimpleNamespace(atr=atr), signal, cache


def charge_holding(trades, *, seconds, bps_per_day):
    if not math.isfinite(bps_per_day) or bps_per_day < 0:
        raise ValueError('Invalid holding cost assumption')
    return [replace(trade, r_multiple=trade.r_multiple -
        trade.entry_price * bps_per_day / 10000 * max(0, trade.exit_time + seconds - trade.entry_time) / 86400
        / abs(trade.entry_price - trade.initial_stop)) for trade in trades]


def fold_summary(trades):
    # Keep both views: dropping unresolved positions must not hide their modelled loss.
    return {'closed_trades_only': r_summary(trades),
        'including_fold_end_mark_to_market': r_summary([replace(t, exit_reason='fold_mark_to_market') if t.exit_reason == 'end_of_data' else t for t in trades]),
        'unresolved_positions': sum(t.exit_reason == 'end_of_data' for t in trades)}


def evaluate_profile(dataset, profile):
    tf = {'H1': '1H', 'M15': '15m'}[profile.timeframe]
    seconds = {'H1': 3600, 'M15': 900}[profile.timeframe]
    if dataset['instrument'] != profile.symbol or dataset.get('accountKind') != 'demo':
        raise ValueError('Frozen demo profile must match exact dataset instrument/account kind')
    original = dataset['frames'][tf]
    validate_bars(original, seconds=seconds, captured_at=dataset['capturedAt'])
    if len(original) < profile.history_bars * 2:
        return {'status': 'insufficient_history', 'bars': len(original), 'profile': asdict(profile)}
    point = dataset['point']
    bars = causal_spread_history(original, point=point, floor_price=POLICY['spread_floor_price'][profile.symbol])
    series, signal, cache = runtime_series(bars, profile)
    costs = POLICY['crypto' if profile.symbol.startswith('BTC') else 'forex']
    end_time = min(int(dataset['capturedAt'] // seconds) * seconds, int(bars[-1]['time']) + seconds)
    start_time = end_time - POLICY['window_days'] * 86400
    times = [b['time'] for b in bars]
    results = []
    for name, left, right in POLICY['folds']:
        begin = int((start_time + (end_time - start_time) * left) // seconds) * seconds
        finish = int((start_time + (end_time - start_time) * right) // seconds) * seconds
        first = bisect_left(times, begin)
        end = bisect_right(times, finish - seconds)
        if first < profile.history_bars or end <= first:
            results.append({'fold': name, 'status': 'insufficient_fold_history', 'from': begin, 'to': finish}); continue
        options = dict(point=point, stops_level=POLICY['assumed_stops_level_points'], entry_start=first, end=end,
            series=series, signal_fn=signal, **costs)
        base = simulate_fold(bars, profile, **options)
        doubled = simulate_fold(bars, profile, cost_multiplier=2, **options)
        paired = paired_cost_stress(base, bars, point, slippage_bps=costs['slippage_bps'], round_trip_fee_bps=costs['round_trip_fee_bps'])
        scenarios = {'base': charge_holding(base, seconds=seconds, bps_per_day=POLICY['holding_bps_per_day']),
            'costs_2x_resimulated': charge_holding(doubled, seconds=seconds, bps_per_day=2 * POLICY['holding_bps_per_day']),
            'same_trades_extra_costs': charge_holding(paired, seconds=seconds, bps_per_day=2 * POLICY['holding_bps_per_day'])}
        results.append({'fold': name, 'from': begin, 'to': finish, 'bars': end - first,
            'scenarios': {key: {'summary': fold_summary(rows), 'trades': [asdict(t) for t in rows]} for key, rows in scenarios.items()}})
    return {'profile': asdict(profile), 'history_bars': len(bars), 'folds': results,
        'signal_evaluation': {'method': 'production_function_for_every_evaluated_index_cached_across_cost_scenarios', 'unique_calls': len(cache)},
        'profitability_verified': False, 'ready_for_real': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, help='Existing dataset saved by run-signals-replay.mjs; no broker connection')
    args = parser.parse_args()
    # Freeze source profile and policies before reading results/data. No parameter search.
    forex = frozen_profiles()
    profiles = {'xau_stable_h1': forex['xau_stable_h1'], 'xau_aggressive_m15': forex['xau_aggressive_m15'],
        'btc_h1': load_broker_crypto_config().strategies['BTCUSDm']}
    source_files = ['robot_forex_pro.py', 'robot_crypto_broker.py', 'trading_core.py', 'validate_forex_runtime_profiles.py', 'mt5_gateway.py']
    hashes = {name: hashlib.sha256((ROBOT / name).read_bytes()).hexdigest() for name in source_files}
    raw = Path(args.input).read_bytes()
    payload = json.loads(raw)
    if payload.get('readOnly') is not True or not isinstance(payload.get('datasets'), list):
        raise ValueError('Expected a saved read-only broker dataset')
    datasets = {d['instrument']: d for d in payload['datasets']}
    created = datetime.now(timezone.utc)
    report = {'created_at': created.isoformat(), 'policy': POLICY, 'source_hashes': hashes,
        'replay_hash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'dataset_hash': hashlib.sha256(raw).hexdigest(),
        'profiles': {}, 'profitability_verified': False, 'ready_for_real': False,
        'limitations': ['Historical audit, not new forward evidence; no retuning or virgin holdout claim.',
            'Previous closed-bar spread + fixed floor is only a causal proxy, not historical tick Ask.',
            'SL/TP quote-anchored before slip; management reuses audited runtime mirror, actual signal and ATR functions are called directly.',
            'Runtime spread caps use explicit audit policy, not a claim about a currently running worker config.',
            'Fees/holding are assumptions; no actual rollover/triple-swap, lot, margin, risk-ledger, portfolio or broker-rejection simulation.',
            'Stop-level floor zero and no broker tick/digit rounding in this simulator; historical specs unverified.',
            'Closed-R drawdown is not floating/account drawdown. Fold-end modelled values are shown separately; no future exits.',
            'Existing robot permissions, configs and processes are unchanged.']}
    for name, profile in profiles.items():
        if profile.symbol not in datasets:
            report['profiles'][name] = {'status': 'dataset_missing'}; continue
        result = evaluate_profile(datasets[profile.symbol], profile)
        report['profiles'][name] = result
        for fold in result.get('folds', []):
            print(json.dumps({'profile': name, 'fold': fold['fold'], 'scenarios': {k: v['summary'] for k, v in fold.get('scenarios', {}).items()}}), flush=True)
    folder = Path(__file__).resolve().parents[2] / 'local-reports'
    folder.mkdir(exist_ok=True)
    output = folder / f"robot-runtime-replay-{created.strftime('%Y%m%dT%H%M%S%fZ')}.json"
    with output.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
    print(json.dumps({'report_path': str(output), 'profitability_verified': False, 'ready_for_real': False}), flush=True)


if __name__ == '__main__':
    main()
