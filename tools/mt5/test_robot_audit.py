import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from robot_audit import inspect_profile_history


class ProfileHistoryTests(unittest.TestCase):
    def setUp(self):
        self.now = 1_788_930_000
        self.profile = SimpleNamespace(symbol='EURJPYm', timeframe='H1', history_bars=3, max_entry_delay_seconds=120)
        self.bars = [dict(time=self.now - (3 - i) * 3600, open=100, high=101, low=99, close=100) for i in range(3)]
        self.signal = Mock(return_value=None)

    def check(self, bars=None, now=None):
        return inspect_profile_history(self.bars if bars is None else bars, self.profile, self.now if now is None else now, self.signal)

    def test_fresh_and_entry_window_are_separate(self):
        result = self.check()
        self.assertEqual(result['data_status'], 'fresh')
        self.assertEqual(result['latest_signal'], 'wait')
        self.assertTrue(result['within_entry_window'])
        result = self.check(now=self.now + 121)
        self.assertEqual(result['data_status'], 'fresh')
        self.assertFalse(result['within_entry_window'])
        self.assertFalse(result['risk_size_and_portfolio_checked'])

    def test_old_feed_is_not_reported_as_wait_or_evaluated(self):
        for age in (3900, 39_584):
            result = self.check(now=self.now + age)
            self.assertEqual(result['data_status'], 'stale')
            self.assertIsNone(result['latest_signal'])
            self.assertFalse(result['within_entry_window'])
        self.signal.assert_not_called()

    def test_incomplete_and_invalid_bars_fail_before_strategy(self):
        self.assertEqual(self.check(self.bars[:2])['data_status'], 'unavailable')
        for changes in ({'close': float('nan')}, {'high': 99}, {'low': 101}, {'time': self.now}, {'time': self.bars[-2]['time']}, {'open': 0}):
            rows = [dict(row) for row in self.bars]
            rows[-1].update(changes)
            result = self.check(rows)
            self.assertEqual(result['data_status'], 'invalid')
            self.assertIsNone(result['latest_signal'])
        self.signal.assert_not_called()

    def test_invalid_clock_and_timeframe_are_not_directions(self):
        self.assertEqual(self.check(now=float('nan'))['data_status'], 'invalid')
        self.profile.timeframe = 'M5'
        self.assertEqual(self.check()['data_status'], 'invalid')
        self.signal.assert_not_called()


if __name__ == '__main__':
    unittest.main()
