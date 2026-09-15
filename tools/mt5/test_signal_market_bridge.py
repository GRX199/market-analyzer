import unittest
from unittest.mock import patch
from types import SimpleNamespace as NS
import signal_market_bridge as bridge

class BridgeTests(unittest.TestCase):
    def test_expanded_catalog_mapping_does_not_enable_symbols_or_swap_tokens(self):
        for base in ['BCH', 'TRX', 'SUI', 'NEAR', 'UNI', 'AAVE', 'POL']:
            for suffix in ['', 'm', 'c']:
                self.assertEqual(bridge.canonical_symbol(base + 'USD' + suffix), base + '/USDT')
        for base in ['NZDJPY', 'CADCHF', 'NZDCAD', 'NZDCHF', 'EURNZD', 'GBPNZD', 'USDCNH', 'USDNOK', 'USDSEK', 'USDPLN', 'EURNOK', 'EURSEK', 'GBPSEK']:
            self.assertEqual(bridge.canonical_symbol(base + 'c'), base[:3] + '/' + base[3:])
        self.assertEqual(bridge.canonical_symbol('MATICUSDm'), 'MATIC/USDT')
        self.assertNotIn('SUIUSD', bridge.DEFAULT_BASES)

    def test_exact_symbols(self):
        for instrument, key in [('BTCUSDm', 'BTC/USDT'), ('XAUUSDc', 'XAU/USD'), ('EURJPYm', 'EUR/JPY'), ('USDIDRm', 'USD/IDR')]:
            self.assertEqual(bridge.canonical_symbol(instrument), key)
        for bad in ['BTCUSDjunk', 'EURJPYm;bad', 'ABCXYZ', 'XAUUSD247', 'UNKNOWN']:
            with self.assertRaises(ValueError): bridge.canonical_symbol(bad)

    def test_endpoint_secret_not_sent_to_insecure_or_redirected_origin(self):
        for url in ['http://evil.test', 'https://example.test/path', 'https://u:p@example.test', 'https://example.test?key=1']:
            with self.assertRaises(ValueError): bridge.validate_endpoint(url, 'a' * 40)
        self.assertEqual(bridge.validate_endpoint('http://127.0.0.1:3102', 'a' * 40), 'http://127.0.0.1:3102/api/signals/broker')
        with self.assertRaises(ValueError): bridge.validate_endpoint('https://example.test', 'your_token')

    def test_publish_requires_ack_and_never_logs_response_secrets(self):
        payload = {'symbol': 'BTC/USDT'}
        for status, body, success in [(200, {'accepted': True, 'symbol': 'BTC/USDT'}, True), (409, {'accepted': False, 'symbol': 'BTC/USDT'}, True), (200, {}, False), (200, {'accepted': True, 'symbol': 'XAU/USD'}, False), (302, {}, False), (400, {'error': 'secret'}, False)]:
            with patch.object(bridge.requests, 'post', return_value=NS(status_code=status, json=lambda: body)) as post:
                if success: self.assertTrue(bridge.publish(payload, 'https://example.test/api/signals/broker', 'private'))
                else:
                    with self.assertRaises(RuntimeError) as caught: bridge.publish(payload, 'https://example.test/api/signals/broker', 'private')
                    self.assertNotIn('secret', str(caught.exception))
                self.assertFalse(post.call_args.kwargs['allow_redirects'])

    def test_account_switch_stops_before_collection(self):
        old = NS(login=1, server='Exness-MT5Trial14', company='Exness Technologies Ltd')
        new = NS(login=2, server=old.server, company=old.company)
        with patch.object(bridge.mt5, 'account_info', return_value=new), patch.object(bridge.mt5, 'terminal_info', return_value=NS(connected=True)):
            with self.assertRaises(bridge.AccountChanged): bridge.assert_account(bridge.account_ref(old))

    def test_history_and_stale_quotes_fail_before_upload(self):
        info = NS(login=1, server='Exness-MT5Trial14', company='Exness Technologies Ltd', trade_mode=0)
        with patch.object(bridge, 'assert_account'), patch.object(bridge.mt5, 'symbol_select', return_value=True), patch.object(bridge.mt5, 'copy_rates_from_pos', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'History'): bridge.snapshot('XAUUSDm', info)

    def test_default_symbols_not_inherited_from_different_account_suffix(self):
        symbols = bridge.read_symbols({'FOREX_SYMBOLS': 'XAUUSDm'}, NS(currency='USC'))
        self.assertIn('XAUUSDc', symbols); self.assertNotIn('XAUUSDm', symbols)

if __name__ == '__main__': unittest.main()
