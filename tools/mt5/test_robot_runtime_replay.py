from copy import deepcopy
from types import SimpleNamespace as NS
import unittest

from robot_runtime_replay import causal_spread_history, charge_holding, fold_summary, runtime_series, validate_bars, evaluate_profile
from backtest_current_strategies import BacktestTrade
from trading_core import calculate_atr


class OfflineRuntimeReplayTests(unittest.TestCase):
    def bars(self, count=40):
        return [dict(time=1_788_000_000 + i * 3600, open=100, high=102 + i * .1, low=99, close=101, spread=i + 1) for i in range(count)]

    def test_spread_is_causal_and_does_not_modify_bid_history(self):
        bars = self.bars()
        before = deepcopy(bars)
        adapted = causal_spread_history(bars, point=.1, floor_price=.5)
        self.assertEqual(adapted[0]['spread'], 5)
        self.assertEqual(adapted[20]['spread'], bars[19]['spread'])
        self.assertEqual(bars, before)
        bars[20]['spread'] = 999999
        changed = causal_spread_history(bars, point=.1, floor_price=.5)
        self.assertEqual(changed[:21], adapted[:21])
        self.assertEqual(changed[21]['spread'], 999999)

    def test_signal_uses_production_window_and_cached_calls_have_no_future_candles(self):
        bars = self.bars()
        calls = []
        def signal(rows, _profile):
            calls.append(deepcopy(rows))
            return 'buy'
        series, callback, cache = runtime_series(bars, NS(history_bars=20), signal)
        self.assertIsNone(callback(series, 18, None))
        self.assertEqual(callback(series, 23, None), 'buy')
        self.assertEqual(callback(series, 23, None), 'buy')
        self.assertEqual(calls, [bars[4:24]])
        self.assertEqual(len(cache), 2)
        self.assertEqual(series.atr[23], calculate_atr(bars[:24], 14))

    def test_end_of_fold_loss_is_visible_separately_from_realized_trades(self):
        closed = BacktestTrade('test', 'BTCUSDm', 'buy', 1000, 4600, 100, 105, 95, 1, 'take_profit')
        unresolved = BacktestTrade('test', 'BTCUSDm', 'buy', 5000, 8600, 100, 90, 95, -2, 'end_of_data')
        result = fold_summary([closed, unresolved])
        self.assertEqual(result['closed_trades_only']['net_r'], 1)
        self.assertEqual(result['including_fold_end_mark_to_market']['net_r'], -1)
        self.assertEqual(result['unresolved_positions'], 1)
        self.assertEqual(unresolved.exit_reason, 'end_of_data')
        self.assertNotIn('modeled_return_pct', result['closed_trades_only'])

    def test_holding_cost_cannot_improve_or_reselect_trades(self):
        trade = BacktestTrade('test', 'BTCUSDm', 'buy', 1000, 4600, 100, 105, 95, 1, 'take_profit')
        base = charge_holding([trade], seconds=3600, bps_per_day=1)[0]
        stress = charge_holding([trade], seconds=3600, bps_per_day=2)[0]
        self.assertLess(stress.r_multiple, base.r_multiple)
        self.assertLess(base.r_multiple, trade.r_multiple)
        self.assertEqual(base.entry_time, stress.entry_time)
        self.assertEqual(base.exit_price, stress.exit_price)

    def test_invalid_and_future_history_fails_closed(self):
        for changes in ({'time': 1_999_999_999}, {'high': float('nan')}, {'spread': -1}, {'close': 1000}):
            bars = self.bars()
            bars[-1].update(changes)
            with self.assertRaises(ValueError):
                validate_bars(bars, seconds=3600, captured_at=1_789_000_000)
        for point, floor in ((0, .5), (.01, 0), (float('nan'), .5)):
            with self.assertRaises(ValueError):
                causal_spread_history(self.bars(), point=point, floor_price=floor)

    def test_exact_demo_profile_identity_required_without_account_substitution(self):
        profile = NS(timeframe='H1', symbol='BTCUSDm')
        for dataset in ({'instrument': 'BTCUSDc', 'accountKind': 'demo'}, {'instrument': 'BTCUSDm', 'accountKind': 'real'}):
            with self.assertRaisesRegex(ValueError, 'exact dataset'):
                evaluate_profile(dataset, profile)


if __name__ == '__main__':
    unittest.main()
