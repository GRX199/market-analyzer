"""Read-only diagnostic of current broker data and existing robot profiles.

Does not start workers, acknowledge ledgers, publish history or place orders.
History by marker is descriptive, NOT certified forward evidence for a version.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict
import json
import math
import sys
import time
import MetaTrader5 as mt5

ROBOT = Path(__file__).resolve().parents[3] / 'mt5-robot'
sys.path.insert(0, str(ROBOT))
try:
    from trade_history import build_closed_trade_records
    from validate_forex_runtime_profiles import frozen_profiles, runtime_signal
    from robot_crypto_broker import load_broker_crypto_config
    from robot_forex_pro import MAGIC_NUMBER as FOREX_MAGIC
    from trading_core import as_rate_mappings
finally:
    # Do not shadow the maintained bridge with its sibling compatibility launcher.
    sys.path.remove(str(ROBOT))

def inspect_profile_history(bars, profile, checked_at, signal_function=runtime_signal):
    """Classify data before evaluating a direction; stale data is never WAIT."""
    result = {'symbol': profile.symbol, 'timeframe': profile.timeframe,
        'closed_bars': len(bars), 'latest_signal': None, 'data_status': 'unavailable',
        'closed_candle_age_seconds': None, 'entry_window_seconds': profile.max_entry_delay_seconds,
        'within_entry_window': False, 'risk_size_and_portfolio_checked': False}
    seconds = {'H1': 3600, 'M15': 900}.get(profile.timeframe)
    if seconds is None or not math.isfinite(checked_at) or checked_at <= 0:
        return {**result, 'data_status': 'invalid', 'reason': 'Unsupported timeframe or invalid audit clock'}
    if len(bars) < profile.history_bars:
        return {**result, 'reason': 'History warm-up incomplete; no direction evaluated'}
    previous = 0
    try:
        for bar in bars:
            timestamp = float(bar['time'])
            prices = [float(bar[key]) for key in ('open', 'high', 'low', 'close')]
            opening, high, low, closing = prices
            if (not all(math.isfinite(value) and value > 0 for value in [timestamp, *prices])
                or timestamp <= previous or timestamp + seconds > checked_at
                or high < max(opening, closing) or low > min(opening, closing)):
                raise ValueError('Invalid or unclosed history')
            previous = timestamp
    except (KeyError, TypeError, ValueError, OverflowError):
        return {**result, 'data_status': 'invalid', 'reason': 'Invalid, duplicate, unordered or unclosed candle; no direction evaluated'}
    age = checked_at - previous - seconds
    result['closed_candle_age_seconds'] = round(age)
    # Fresh last bar is not proof of tick continuity, complete sessions or market openness.
    if age >= seconds + 300:
        return {**result, 'data_status': 'stale', 'reason': 'Last closed candle is old; check terminal history/feed/session, not strategy filters'}
    result.update(data_status='fresh', latest_signal=signal_function(bars, profile) or 'wait',
        within_entry_window=0 <= age <= profile.max_entry_delay_seconds)
    return result

def main():
    if not mt5.initialize(timeout=10_000): raise RuntimeError('MT5 unavailable')
    try:
        account = mt5.account_info()
        if account is None: raise RuntimeError('No account')
        pinned = (account.login, account.server)
        now = datetime.now(timezone.utc)
        since = now - timedelta(days=90)
        deals, orders, positions = mt5.history_deals_get(since, now), mt5.history_orders_get(since, now), mt5.positions_get()
        if deals is None or orders is None or positions is None: raise RuntimeError('Broker history/positions unavailable')
        records = build_closed_trade_records(mt5=mt5, deals=deals, historical_orders=orders, open_positions=positions, account=account,
            strategies_by_magic={234004: ('crypto_scalper', 'crypto'), FOREX_MAGIC: ('forex_legacy_unknown', 'forex')})
        grouped = defaultdict(list)
        for record in records:
            grouped[(record.strategy, record.symbol)].append(record.gross_profit + record.commission + record.swap + record.fee)
        summary = []
        for (strategy, symbol), pnls in grouped.items():
            gains, losses = sum(max(p, 0) for p in pnls), -sum(min(p, 0) for p in pnls)
            summary.append({'strategy_label': strategy, 'symbol': symbol, 'closed_positions': len(pnls), 'net': round(sum(pnls), 2),
                            'profit_factor': gains / losses if losses else None, 'expectancy': round(sum(pnls) / len(pnls), 4)})
        diagnostics = []
        if account.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO:
            profiles = frozen_profiles()
            profiles['btc_h1'] = load_broker_crypto_config().strategies['BTCUSDm']
            for name, profile in profiles.items():
                tf = mt5.TIMEFRAME_H1 if profile.timeframe == 'H1' else mt5.TIMEFRAME_M15
                rates = mt5.copy_rates_from_pos(profile.symbol, tf, 1, profile.history_bars)
                bars = [] if rates is None else list(as_rate_mappings(rates))
                diagnostics.append({'profile': name, **inspect_profile_history(bars, profile, time.time())})
        current = mt5.account_info()
        if current is None or (current.login, current.server) != pinned: raise RuntimeError('Account changed: discard audit')
        trading = [d for d in deals if d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL)]
        return {'checked_at': now.isoformat(), 'read_only': True, 'account_kind': 'demo' if account.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else 'real',
            'currency': account.currency, 'lookback_days': 90, 'trading_deal_count': len(trading), 'open_positions': len(positions),
            'net_all_trading_deals': round(sum(d.profit + d.commission + d.swap + d.fee for d in trading), 2),
            'history_by_label_not_version_certified': summary, 'robot_signal_diagnostics': diagnostics,
            'limitations': ['Account totals include older/manual strategies, not only the current version.',
                'No full equity/drawdown reconstruction, verified 12-week evidence or automatic real readiness.',
                'Data status checks OHLC and last-bar age, not full tick/session continuity or current execution availability.',
                'A signal or open entry window is not order authorization; risk and portfolio checks remain required.']}
    finally: mt5.shutdown()

if __name__ == '__main__': print(json.dumps(main(), indent=2))
