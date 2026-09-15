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
  secondTarget?: number | null;
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
  if (![input.quote, input.entry, input.stopLoss, input.takeProfit].every(positive)
    || (input.secondTarget != null && !positive(input.secondTarget))) {
    return { valid: false, error: 'Quote, entry, SL, dan TP1 harus positif. TP2 opsional; jika diisi harus positif.' };
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
    ? input.stopLoss < input.entry && input.entry < input.takeProfit && (input.secondTarget == null || input.takeProfit < input.secondTarget)
    : input.stopLoss > input.entry && input.entry > input.takeProfit && (input.secondTarget == null || input.takeProfit > input.secondTarget);
  if (!validProtection) {
    return {
      valid: false,
      error: side === 'buy'
        ? 'BUY wajib memenuhi SL < Entry < TP1, lalu TP2 jika diisi.'
        : 'SELL wajib memenuhi SL > Entry > TP1, lalu TP2 jika diisi.',
    };
  }

  return { valid: true, side };
}

/** Price distances only; cash risk requires the broker contract and account currency. */
export function manualOrderMetrics(input: ManualOrderDraftInput) {
  if (!validateManualOrderDraft({ ...input, conditional: false }).valid) return null;
  const direction = manualOrderSide(input.orderType) === 'buy' ? 1 : -1;
  const risk = direction * (input.entry - input.stopLoss);
  const reward = direction * (input.takeProfit - input.entry);
  const riskReward = reward / risk;
  const quoteDistance = Math.abs(input.entry - input.quote);
  if (![risk, reward, riskReward, quoteDistance].every(Number.isFinite)) return null;
  return { risk, reward, riskReward, quoteDistance };
}

export interface ManualOrderRequestFields {
  symbol: string;
  marketType: 'forex' | 'crypto';
  action: ManualOrderSide;
  orderType: ManualOrderType;
  volume: number;
  quotePrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  accountKind: 'demo' | 'real';
}

/** Persist BEFORE POST. Exact order parameters reuse their key across retries and page reloads in this tab. */
export function manualOrderRequestKey(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  ownerId: string,
  request: ManualOrderRequestFields,
  createId = () => crypto.randomUUID(),
): string {
  if (!ownerId) throw new Error('Masuk kembali sebelum mengirim order.');
  // Explicit field order; acknowledgements and the analysis timestamp do not create a new order.
  const fingerprint = JSON.stringify([request.symbol, request.marketType, request.action, request.orderType,
    request.volume, request.quotePrice, request.entryPrice, request.stopLoss, request.takeProfit, request.accountKind]);
  const storageKey = `signals:manual-request:v1:${ownerId}:${fingerprint}`;
  const existing = storage.getItem(storageKey);
  if (existing !== null) {
    if (!/^signals:[a-f0-9-]{36}$/.test(existing)) throw new Error('ID pengiriman tersimpan tidak valid. Periksa antrean di Robot & Sistem sebelum mencoba lagi.');
    return existing;
  }
  const key = `signals:${createId()}`;
  if (!/^signals:[a-f0-9-]{36}$/.test(key)) throw new Error('ID pengiriman tidak dapat dibuat.');
  storage.setItem(storageKey, key);
  return key;
}
