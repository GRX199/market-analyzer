"""Read-only Exness candle collector. No orders, account login or risk changes."""
from __future__ import annotations
import argparse
import hashlib
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import MetaTrader5 as mt5
import requests
from dotenv import dotenv_values

FRAMES = {"15m": mt5.TIMEFRAME_M15, "1H": mt5.TIMEFRAME_H1, "4H": mt5.TIMEFRAME_H4, "1D": mt5.TIMEFRAME_D1}
SECONDS = {"15m": 900, "1H": 3600, "4H": 14400, "1D": 86400}
CRYPTO = {"BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "DOT", "LINK", "MATIC", "AVAX", "SHIB", "LTC", "UNI", "ATOM", "ETC"}
CURRENCIES = {"USD", "EUR", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "SGD", "HKD", "ZAR", "MXN", "TRY", "IDR"}
DEFAULT_BASES = ("XAUUSD", "EURUSD", "GBPUSD", "BTCUSD", "ETHUSD", "EURJPY")

class AccountChanged(RuntimeError):
    pass

def log(message):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {message}", flush=True)

def account_ref(info):
    return hashlib.sha256(f"{info.login}|{info.server}|{info.company}".encode()).hexdigest()[:24]

def assert_account(pinned):
    info, terminal = mt5.account_info(), mt5.terminal_info()
    if info is None or terminal is None or not terminal.connected:
        raise RuntimeError("Terminal MT5 tidak terhubung")
    if account_ref(info) != pinned:
        raise AccountChanged("Akun MT5 berubah; periksa akun sebelum restart bridge")
    return info

def canonical_symbol(instrument):
    if not re.fullmatch(r"[A-Z0-9]{6,16}[mc]?", instrument):
        raise ValueError("Gunakan nama simbol persis Market Watch")
    base = instrument[:-1] if instrument.endswith(('m', 'c')) else instrument
    for quote in ('USDT', 'USD'):
        if base.endswith(quote) and base[:-len(quote)] in CRYPTO:
            return base[:-len(quote)] + '/USDT'  # catalog key ONLY, prices remain CFD USD
    if len(base) == 6 and base[3:] in CURRENCIES and base[:3] in CURRENCIES | {'XAU', 'XAG'}:
        return base[:3] + '/' + base[3:]
    raise ValueError("Simbol tidak ada dalam katalog Signals")

def read_symbols(config, info):
    explicit = config.get('SIGNAL_MT5_SYMBOLS')
    if explicit:
        symbols = [v.strip() for v in explicit.split(',') if v.strip()]
    else:
        suffix = 'c' if info.currency == 'USC' else 'm'
        symbols = [base + suffix for base in DEFAULT_BASES]
        for key in ('FOREX_SYMBOLS', 'CRYPTO_BROKER_SYMBOLS'):
            symbols += [v.strip() for v in (config.get(key) or '').split(',') if v.strip().endswith(suffix)]
    symbols = list(dict.fromkeys(symbols))
    if not symbols or len(symbols) > 16:
        raise ValueError("Gunakan 1-16 SIGNAL_MT5_SYMBOLS agar snapshot tetap segar")
    for symbol in symbols:
        canonical_symbol(symbol)
    return symbols

def validate_endpoint(url, token):
    p = urlsplit(url)
    local = p.scheme == 'http' and p.hostname in ('127.0.0.1', 'localhost', '::1')
    if not p.hostname or (p.scheme != 'https' and not local) or p.username or p.password or p.query or p.fragment or p.path not in ('', '/'):
        raise ValueError('TRADING_API_URL wajib origin HTTPS (HTTP hanya localhost), tanpa path/query/credential')
    if not token or len(token.strip()) < 32 or re.match(r'(?i)^(your|replace|example|change)', token):
        raise ValueError('TRADING_WORKER_TOKEN belum valid')
    return url.rstrip('/') + '/api/signals/broker'

def snapshot(symbol, info):
    pinned, canonical = account_ref(info), canonical_symbol(symbol)
    assert_account(pinned)
    if not mt5.symbol_select(symbol, True):
        raise ValueError('Simbol tidak tersedia pada akun ini; tidak disubstitusi')
    frames, captured = [], time.time()
    for name, tf in FRAMES.items():
        rates = mt5.copy_rates_from_pos(symbol, tf, 1, 320)
        if rates is None or len(rates) < 250:
            raise ValueError(f'History {name} belum cukup: {0 if rates is None else len(rates)}/250')
        candles, prior = [], 0
        for r in rates:
            row = {key: float(r[key]) for key in ('open', 'high', 'low', 'close')}
            row.update(time=int(r['time']), volume=float(r['tick_volume']))
            if not all(math.isfinite(v) for v in row.values()) or min(row[k] for k in ('open', 'high', 'low', 'close')) <= 0 or row['volume'] < 0 or row['high'] < max(row['open'], row['close']) or row['low'] > min(row['open'], row['close']) or row['time'] <= prior or row['time'] + SECONDS[name] > captured:
                raise ValueError(f'Candle {name} invalid/duplikat/belum final')
            prior = row['time']
            candles.append(row)
        frames.append({'timeframe': name, 'candles': candles})
    assert_account(pinned)
    tick, captured = mt5.symbol_info_tick(symbol), time.time()
    if tick is None or not all(math.isfinite(v) and v > 0 for v in (tick.bid, tick.ask, tick.time)) or tick.ask < tick.bid:
        raise ValueError('Quote MT5 tidak valid')
    if not -30 <= captured - tick.time <= 180:
        raise ValueError(f'Quote basi/masa depan ({captured - tick.time:.0f}s); periksa sesi/koneksi')
    iso = lambda timestamp: datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace('+00:00', 'Z')
    return {'symbol': canonical, 'instrument': symbol, 'broker': info.company, 'server': info.server,
            'accountKind': 'real' if info.trade_mode == mt5.ACCOUNT_TRADE_MODE_REAL else 'demo', 'accountRef': pinned,
            'capturedAt': iso(captured), 'quoteTime': iso(tick.time), 'bid': tick.bid, 'ask': tick.ask, 'frames': frames}

def publish(payload, endpoint, token):
    try:
        response = requests.post(endpoint, json=payload, headers={'Authorization': f'Bearer {token}'}, timeout=(3, 12), allow_redirects=False)
    except requests.RequestException:
        raise RuntimeError('Upload timeout/gagal; belum ada konfirmasi penerimaan') from None
    try:
        body = response.json()
    except ValueError:
        body = {}
    matching = isinstance(body, dict) and body.get('symbol') == payload['symbol']
    if response.status_code == 200 and matching and body.get('accepted') is True:
        return 'diterima server'
    if response.status_code == 409 and matching and body.get('accepted') is False:
        return 'dilewati: server memiliki snapshot lebih baru'
    # Do not echo arbitrary responses: proxies can echo request secrets.
    hints = {400: 'validasi snapshot ditolak', 401: 'token worker tidak cocok', 403: 'akses ditolak', 404: 'endpoint belum deploy', 413: 'payload terlalu besar', 503: 'periksa migration/konfigurasi server/database'}
    raise RuntimeError(f"HTTP {response.status_code}: {hints.get(response.status_code, 'respons tidak terkonfirmasi')}")

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--interval', type=int, default=60)
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[3] / 'mt5-robot' / '.env')
    args = parser.parse_args(argv)
    config = dotenv_values(args.env_file)
    token = config.get('TRADING_WORKER_TOKEN') or ''
    endpoint = '' if args.dry_run else validate_endpoint(config.get('TRADING_API_URL') or '', token)
    if not mt5.initialize(timeout=10_000):
        log('ERROR koneksi terminal MT5 gagal'); return 1
    try:
        info = mt5.account_info()
        if info is None or not re.match(r'(?i)^Exness\b', info.company) or not info.server.startswith('Exness-MT5') or info.trade_mode not in (mt5.ACCOUNT_TRADE_MODE_DEMO, mt5.ACCOUNT_TRADE_MODE_REAL):
            raise ValueError('Gunakan terminal Exness demo/real; akun tidak diganti otomatis')
        pinned, symbols = account_ref(info), read_symbols(config, info)
        log(f"DATA-ONLY akun {'real' if info.trade_mode == mt5.ACCOUNT_TRADE_MODE_REAL else 'demo'}; {len(symbols)} simbol. Langganan Market Watch; tanpa order.")
        while True:
            started, good, failed = time.monotonic(), 0, 0
            for symbol in symbols:
                try:
                    info = assert_account(pinned)
                    payload = snapshot(symbol, info)
                    assert_account(pinned)
                    outcome = 'valid lokal, tanpa upload' if args.dry_run else publish(payload, endpoint, token)
                    good += 1
                    log(f"OK {symbol}: {outcome}; candle={[len(f['candles']) for f in payload['frames']]}; quote={payload['quoteTime']}")
                except AccountChanged:
                    raise
                except (ValueError, RuntimeError) as error:
                    failed += 1
                    log(f'WARNING {symbol}: {error}')
            log(f'CYCLE: {good} terkonfirmasi, {failed} gagal; robot trading tidak dinyalakan')
            if args.once:
                return 1 if failed else 0
            time.sleep(max(1, max(15, args.interval) - (time.monotonic() - started)))
    except (AccountChanged, ValueError, RuntimeError) as error:
        log(f'ERROR {error}'); return 1
    except KeyboardInterrupt:
        log('Bridge dihentikan operator'); return 0
    finally:
        mt5.shutdown()

if __name__ == '__main__':
    raise SystemExit(main())
