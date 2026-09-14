export const MANUAL_ORDER_TYPES = [
  'buy_limit',
  'buy_stop',
  'sell_limit',
  'sell_stop',
] as const;

export type ManualOrderType = (typeof MANUAL_ORDER_TYPES)[number];
export type ManualOrderSide = 'buy' | 'sell';

export interface ManualOrderDraftInput {
  orderType: ManualOrderType;
  quote: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  secondTarget: number;
  volume: number;
  conditional?: boolean;
  acknowledged?: boolean;
}

export type ManualOrderValidation =
  | { valid: true; side: ManualOrderSide }
  | { valid: false; error: string };

export function manualOrderSide(orderType: ManualOrderType): ManualOrderSide {
  return orderType.startsWith('buy') ? 'buy' : 'sell';
}

export function manualOrderLabel(orderType: ManualOrderType): string {
  return ({
    buy_limit: 'BUY LIMIT',
    buy_stop: 'BUY STOP',
    sell_limit: 'SELL LIMIT',
    sell_stop: 'SELL STOP',
  } as Record<ManualOrderType, string>)[orderType];
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateManualOrderDraft(
  input: ManualOrderDraftInput,
): ManualOrderValidation {
  if (!MANUAL_ORDER_TYPES.includes(input.orderType)) {
    return { valid: false, error: 'Jenis pending order tidak valid.' };
  }
  if (![input.quote, input.entry, input.stopLoss, input.takeProfit, input.secondTarget].every(positive)) {
    return { valid: false, error: 'Quote, entry, SL, TP1, dan TP2 harus berupa angka positif.' };
  }
  if (!Number.isFinite(input.volume) || input.volume <= 0 || input.volume > 100) {
    return { valid: false, error: 'Volume harus lebih besar dari 0 dan maksimal 100 lot.' };
  }
  if (input.conditional && !input.acknowledged) {
    return { valid: false, error: 'Konfirmasi dulu bahwa ini masih skenario bersyarat, bukan entry aktif.' };
  }

  const side = manualOrderSide(input.orderType);
  const isLimit = input.orderType.endsWith('limit');
  const entryOnCorrectSide = side === 'buy'
    ? isLimit ? input.entry < input.quote : input.entry > input.quote
    : isLimit ? input.entry > input.quote : input.entry < input.quote;
  if (!entryOnCorrectSide) {
    return {
      valid: false,
      error: `${manualOrderLabel(input.orderType)} harus berada ${side === 'buy' ? (isLimit ? 'di bawah' : 'di atas') : (isLimit ? 'di atas' : 'di bawah')} quote broker.`,
    };
  }

  const validProtection = side === 'buy'
    ? input.stopLoss < input.entry && input.entry < input.takeProfit && input.takeProfit < input.secondTarget
    : input.stopLoss > input.entry && input.entry > input.takeProfit && input.takeProfit > input.secondTarget;
  if (!validProtection) {
    return {
      valid: false,
      error: side === 'buy'
        ? 'BUY wajib memenuhi SL < Entry < TP1 < TP2.'
        : 'SELL wajib memenuhi SL > Entry > TP1 > TP2.',
    };
  }

  return { valid: true, side };
}
