"""Export bounded closed-bar history to stdout, without orders or account switching."""
import json
import math
import os
from pathlib import Path
import subprocess
import time
import MetaTrader5 as mt5


def _terminal_process_check():
    """Verify the existing MT5 process before initialize() may attach to it.

    The optional path prevents MT5's default discovery from attaching to a
    different terminal when more than one installation exists.  This command
    is read-only; it never launches, logs in, or selects an account.
    """
    configured = os.environ.get('SIGNAL_MT5_TERMINAL_PATH', '').strip()
    terminal_path = None
    if configured:
        terminal_path = Path(configured).expanduser().resolve()
        if terminal_path.name.lower() != 'terminal64.exe' or not terminal_path.is_file():
            raise RuntimeError('SIGNAL_MT5_TERMINAL_PATH must point to an existing terminal64.exe')
        # Win32_Process exposes the executable path, unlike Get-Process, so
        # another terminal cannot satisfy this guard accidentally.
        script = ("$target = [IO.Path]::GetFullPath('%s').ToLowerInvariant(); "
                  "$matches = @(Get-CimInstance Win32_Process -Filter \"Name='terminal64.exe'\" "
                  "-ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and "
                  "$_.ExecutablePath.ToLowerInvariant() -eq $target }); "
                  "if ($matches.Count -eq 1) { exit 0 }; exit 1") % str(terminal_path).replace("'", "''")
    else:
        script = "if (@(Get-Process -Name terminal64 -ErrorAction SilentlyContinue).Count -eq 1) { exit 0 }; exit 1"
    terminal = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
        capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
    if terminal.returncode != 0:
        if terminal_path:
            raise RuntimeError('The configured MT5 terminal is not the only matching running terminal')
        raise RuntimeError('Open exactly one MT5 terminal first; collector will not launch or choose an account')
    return terminal_path


def collect():
    if os.name != 'nt':
        raise RuntimeError('Requires an already-open Windows MT5 terminal')
    # initialize() may launch/discover a terminal. Refuse unless an existing
    # process was verified; an explicit path pins which installation is used.
    terminal_path = _terminal_process_check()
    policy = json.loads((Path(__file__).resolve().parents[1] / 'signals-replay-policy.json').read_text(encoding='utf-8'))
    initialized = mt5.initialize(str(terminal_path), timeout=10_000) if terminal_path else mt5.initialize(timeout=10_000)
    if not initialized:
        raise RuntimeError('MT5 connection unavailable')
    try:
        account = mt5.account_info()
        if account is None or not account.company.startswith('Exness') or not account.server.startswith('Exness-MT5'):
            raise RuntimeError('Verified Exness terminal required for this session-specific replay')
        pinned = (account.login, account.server, account.company, account.trade_mode, account.currency)
        def check_account():
            current, state = mt5.account_info(), mt5.terminal_info()
            if current is None or state is None or not state.connected or (current.login, current.server, current.company, current.trade_mode, current.currency) != pinned:
                raise RuntimeError('Account changed/disconnected: discard history export')
        check_account()
        suffix = 'c' if account.currency == 'USC' else 'm'
        datasets, errors = [], []
        for base, key, session in [('XAUUSD', 'XAU/USD', 'exness-metals'), ('BTCUSD', 'BTC/USDT', 'continuous')]:
            instrument = base + suffix
            check_account()
            info = mt5.symbol_info(instrument)
            if info is None:
                errors.append({'instrument': instrument, 'reason': 'Instrument unavailable; no substitution'}); continue
            point, tick_size = float(info.point), float(info.trade_tick_size)
            if not all(math.isfinite(v) and v > 0 for v in (point, tick_size)):
                errors.append({'instrument': instrument, 'reason': 'Invalid symbol point/tick size'}); continue
            frames = {}
            for tf, constant in [('15m', mt5.TIMEFRAME_M15), ('1H', mt5.TIMEFRAME_H1), ('4H', mt5.TIMEFRAME_H4)]:
                count = policy['historyBars'][tf]
                if not isinstance(count, int) or not 320 <= count <= 20000:
                    raise RuntimeError('Invalid bounded history request')
                check_account()
                rates = mt5.copy_rates_from_pos(instrument, constant, 1, count)
                check_account()
                if rates is None:
                    errors.append({'instrument': instrument, 'timeframe': tf, 'reason': 'MT5 history unavailable'}); break
                frames[tf] = [dict(time=int(r['time']), open=float(r['open']), high=float(r['high']), low=float(r['low']),
                    close=float(r['close']), volume=float(r['tick_volume']), spread=float(r['spread'])) for r in rates]
            if len(frames) == 3:
                datasets.append(dict(symbol=key, instrument=instrument, session=session, point=point, tickSize=tick_size,
                    capturedAt=time.time(), accountKind='demo' if account.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else 'real', frames=frames))
        check_account()
        return {'datasets': datasets, 'errors': errors, 'readOnly': True}
    finally:
        mt5.shutdown()


if __name__ == '__main__':
    print(json.dumps(collect(), allow_nan=False, separators=(',', ':')))
