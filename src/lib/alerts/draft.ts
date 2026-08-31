import { ALL_SYMBOLS } from '../constants.ts';
import type { MarketType } from '../../types/market.ts';

export type CreatableAlertType = 'price_above' | 'price_below' | 'signal_change';
export type AlertTargetSignal = 'strong_buy' | 'buy' | 'sell' | 'strong_sell';
export type AlertTimeframe = '15m' | '1H' | '4H' | '1D';

export interface AlertDraft {
  symbol: string;
  marketType: MarketType;
  alertType: CreatableAlertType;
  targetValue: string;
  targetSignal: string;
  timeframe: string;
}

export type ValidatedAlertDraft = {
  symbol: string;
  marketType: MarketType;
  alertType: CreatableAlertType;
  targetValue: number | null;
  targetSignal: AlertTargetSignal | null;
  timeframe: AlertTimeframe | null;
};

export type AlertDraftValidation =
  | { valid: true; value: ValidatedAlertDraft }
  | { valid: false; error: string };

const TARGET_SIGNALS = new Set<AlertTargetSignal>([
  'strong_buy',
  'buy',
  'sell',
  'strong_sell',
]);
const ALERT_TIMEFRAMES = new Set<AlertTimeframe>(['15m', '1H', '4H', '1D']);

export function validateAlertDraft(draft: AlertDraft): AlertDraftValidation {
  const symbol = draft.symbol.trim().toUpperCase();
  const asset = ALL_SYMBOLS.find((candidate) => candidate.symbol.toUpperCase() === symbol);
  if (!asset) {
    return { valid: false, error: 'Pilih simbol yang didukung oleh feed market.' };
  }
  if (asset.marketType !== draft.marketType) {
    return { valid: false, error: 'Jenis market tidak cocok dengan simbol yang dipilih.' };
  }

  if (draft.alertType === 'signal_change') {
    if (!TARGET_SIGNALS.has(draft.targetSignal as AlertTargetSignal)) {
      return { valid: false, error: 'Target sinyal tidak valid.' };
    }
    if (!ALERT_TIMEFRAMES.has(draft.timeframe as AlertTimeframe)) {
      return { valid: false, error: 'Timeframe alert tidak valid.' };
    }

    return {
      valid: true,
      value: {
        symbol: asset.symbol,
        marketType: asset.marketType,
        alertType: draft.alertType,
        targetValue: null,
        targetSignal: draft.targetSignal as AlertTargetSignal,
        timeframe: draft.timeframe as AlertTimeframe,
      },
    };
  }

  const targetValue = Number(draft.targetValue);
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return { valid: false, error: 'Target harga harus berupa angka positif.' };
  }

  return {
    valid: true,
    value: {
      symbol: asset.symbol,
      marketType: asset.marketType,
      alertType: draft.alertType,
      targetValue,
      targetSignal: null,
      timeframe: null,
    },
  };
}
