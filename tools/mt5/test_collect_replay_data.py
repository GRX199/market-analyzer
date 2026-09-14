import json
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch
import collect_replay_data as collector


class ReadOnlyCollectorTests(unittest.TestCase):
    def account(self, login=1):
        return NS(login=login, company='Exness Technologies Ltd', server='Exness-MT5Trial14', currency='USD', trade_mode=collector.mt5.ACCOUNT_TRADE_MODE_DEMO)

    def test_no_terminal_refuses_before_initialize(self):
        with patch.object(collector.subprocess, 'run', return_value=NS(returncode=1)), patch.object(collector.mt5, 'initialize') as initialize:
            with self.assertRaisesRegex(RuntimeError, 'exactly one'):
                collector.collect()
            initialize.assert_not_called()

    def test_explicit_terminal_path_is_validated_and_pinned(self):
        with patch.dict(collector.os.environ, {'SIGNAL_MT5_TERMINAL_PATH': 'C:\\Program Files\\MetaTrader 5\\terminal64.exe'}), \
            patch.object(collector.Path, 'is_file', return_value=True), \
            patch.object(collector.subprocess, 'run', return_value=NS(returncode=0)) as run, \
            patch.object(collector.mt5, 'initialize', return_value=True) as initialize, \
            patch.object(collector.mt5, 'account_info', side_effect=RuntimeError('stop after pin')):
            with self.assertRaisesRegex(RuntimeError, 'stop after pin'):
                collector.collect()
            self.assertIn('Win32_Process', run.call_args.args[0][-1])
            self.assertEqual(initialize.call_args.args[0].lower().replace('/', '\\'),
                             'c:\\program files\\metatrader 5\\terminal64.exe')

    def test_export_whitelists_candles_and_does_not_send_orders_or_login(self):
        rate = dict(time=1_788_900_000, open=100, high=101, low=99, close=100, tick_volume=10, spread=2)
        with patch.object(collector.subprocess, 'run', return_value=NS(returncode=0)), \
            patch.object(collector.mt5, 'initialize', return_value=True), \
            patch.object(collector.mt5, 'account_info', return_value=self.account()), \
            patch.object(collector.mt5, 'terminal_info', return_value=NS(connected=True)), \
            patch.object(collector.mt5, 'symbol_info', return_value=NS(point=.01, trade_tick_size=.01)), \
            patch.object(collector.mt5, 'copy_rates_from_pos', return_value=[rate] * 320) as history, \
            patch.object(collector.mt5, 'order_send', side_effect=AssertionError('No orders')) as order, \
            patch.object(collector.mt5, 'login', side_effect=AssertionError('No login')) as login, \
            patch.object(collector.mt5, 'shutdown') as shutdown:
            payload = collector.collect()
            self.assertEqual(len(payload['datasets']), 2)
            self.assertTrue(payload['readOnly'])
            self.assertNotIn('login', json.dumps(payload))
            self.assertNotIn('server', json.dumps(payload))
            self.assertEqual({call.args[0] for call in history.call_args_list}, {'XAUUSDm', 'BTCUSDm'})
            self.assertTrue(all(call.args[2] == 1 for call in history.call_args_list))
            order.assert_not_called()
            login.assert_not_called()
            shutdown.assert_called_once()

    def test_account_switch_discards_export_before_history(self):
        with patch.object(collector.subprocess, 'run', return_value=NS(returncode=0)), \
            patch.object(collector.mt5, 'initialize', return_value=True), \
            patch.object(collector.mt5, 'account_info', side_effect=[self.account(), self.account(2)]), \
            patch.object(collector.mt5, 'terminal_info', return_value=NS(connected=True)), \
            patch.object(collector.mt5, 'copy_rates_from_pos') as history, \
            patch.object(collector.mt5, 'shutdown') as shutdown:
            with self.assertRaisesRegex(RuntimeError, 'Account changed'):
                collector.collect()
            history.assert_not_called()
            shutdown.assert_called_once()


if __name__ == '__main__':
    unittest.main()
