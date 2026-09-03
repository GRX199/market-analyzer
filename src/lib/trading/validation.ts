export const MAX_TRADE_VOLUME = 100;
export const DEMO_CRYPTO_REQUESTED_VOLUME = 0.01;
export const WORKER_CLAIM_LIMIT = 1;

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9./_#-]{1,31}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROKER_TICKET_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const TELEGRAM_CHAT_ID_PATTERN = /^-?[1-9][0-9]{4,19}$/;
const CLAIMED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_QUEUE_ATTEMPTS = 5;

export const ROBOT_NOTIFICATION_EVENT_TYPES = [
  'startup',
  'trade_opened',
  'trade_closed',
  'break_even',
  'attention',
  'shutdown',
] as const;

export type RobotNotificationEventType =
  (typeof ROBOT_NOTIFICATION_EVENT_TYPES)[number];

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CreateTradeInput = {
  symbol: string;
  marketType: 'crypto';
  action: 'buy' | 'sell';
  volume: number;
  idempotencyKey: string;
};

export type ClaimTradesInput = {
  worker_id: string;
  limit: 1;
};

type FinalizeClaimFence = {
  worker_id: string;
  idempotency_key: string;
  claimed_at: string;
  attempts: number;
};

export type FinalizeTradeInput = FinalizeClaimFence &
  (
    | {
        status: 'executed';
        execution_price: number;
        executed_volume: number;
        broker_order_ticket: string;
      }
    | {
        status: 'failed';
        error_message: string;
      }
  );

export type TelegramNotificationInput = {
  chatId?: string;
  message: string;
};

export type RobotNotificationInput = {
  worker_id: string;
  event_type: RobotNotificationEventType;
  event_id: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure<T>(error: string): ValidationResult<T> {
  return { success: false, error };
}

function parseWorkerId(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string') {
    return failure('worker_id must be a string');
  }

  const workerId = value.trim();
  if (!WORKER_ID_PATTERN.test(workerId)) {
    return failure('worker_id must be 3-64 safe characters');
  }

  return { success: true, data: workerId };
}

function parseIdempotencyKey(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string') {
    return failure('idempotency key must be a string');
  }

  const idempotencyKey = value.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return failure('idempotency key must be 8-128 safe characters');
  }

  return { success: true, data: idempotencyKey };
}

export function isTradeId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function getSingleConfiguredUserId(
  configuredUserIds: string | undefined
): string | null {
  if (!configuredUserIds?.trim()) {
    return null;
  }

  const configuredValues = configuredUserIds.split(',');
  if (configuredValues.length !== 1) {
    return null;
  }

  const userId = configuredValues[0].trim().toLowerCase();
  return UUID_PATTERN.test(userId) ? userId : null;
}

export function isTradingUserAuthorized(
  userId: string,
  configuredUserIds: string | undefined
): boolean {
  if (!UUID_PATTERN.test(userId)) {
    return false;
  }

  return getSingleConfiguredUserId(configuredUserIds) === userId.toLowerCase();
}

export function isSafeConfiguredSecret(value: string | undefined): value is string {
  if (!value) return false;
  const secret = value.trim();
  return (
    secret.length >= 32
    && !/\s/.test(secret)
    && !/^(?:replace|your|change[-_]?me|example|placeholder|test)/i.test(secret)
  );
}

export function isTelegramChatAuthorized(
  chatId: string,
  configuredChatIds: string | undefined
): boolean {
  if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId) || !configuredChatIds?.trim()) {
    return false;
  }
  const allowedChatIds = configuredChatIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    allowedChatIds.length > 0
    && allowedChatIds.every((value) => TELEGRAM_CHAT_ID_PATTERN.test(value))
    && allowedChatIds.includes(chatId)
  );
}

export function parseCreateTradeInput(
  value: unknown
): ValidationResult<CreateTradeInput> {
  if (!isRecord(value)) {
    return failure('request body must be a JSON object');
  }

  if (typeof value.symbol !== 'string') {
    return failure('symbol must be a string');
  }

  const symbol = value.symbol.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return failure('symbol must be 2-32 safe broker-symbol characters');
  }

  if (value.marketType !== 'crypto') {
    return failure('marketType must be crypto for the configured queue worker');
  }

  if (value.action !== 'buy' && value.action !== 'sell') {
    return failure('action must be buy or sell');
  }

  if (
    typeof value.volume !== 'number' ||
    !Number.isFinite(value.volume) ||
    value.volume !== DEMO_CRYPTO_REQUESTED_VOLUME
  ) {
    return failure(
      `demo crypto volume must be exactly ${DEMO_CRYPTO_REQUESTED_VOLUME}`
    );
  }

  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey);
  if (!idempotencyKey.success) {
    return idempotencyKey;
  }

  return {
    success: true,
    data: {
      symbol,
      marketType: value.marketType,
      action: value.action,
      volume: value.volume,
      idempotencyKey: idempotencyKey.data,
    },
  };
}

export function parseClaimTradesInput(
  value: unknown
): ValidationResult<ClaimTradesInput> {
  if (!isRecord(value)) {
    return failure('request body must be a JSON object');
  }

  const workerId = parseWorkerId(value.worker_id);
  if (!workerId.success) {
    return workerId;
  }

  if (value.limit !== WORKER_CLAIM_LIMIT) {
    return failure(`limit must be exactly ${WORKER_CLAIM_LIMIT}`);
  }

  return {
    success: true,
    data: {
      worker_id: workerId.data,
      limit: WORKER_CLAIM_LIMIT,
    },
  };
}

export function parseFinalizeTradeInput(
  value: unknown
): ValidationResult<FinalizeTradeInput> {
  if (!isRecord(value)) {
    return failure('request body must be a JSON object');
  }

  const workerId = parseWorkerId(value.worker_id);
  if (!workerId.success) {
    return workerId;
  }

  const idempotencyKey = parseIdempotencyKey(value.idempotency_key);
  if (!idempotencyKey.success) {
    return idempotencyKey;
  }

  if (typeof value.claimed_at !== 'string') {
    return failure('claimed_at must be an RFC 3339 timestamp');
  }

  const claimedAt = value.claimed_at.trim();
  if (
    !CLAIMED_AT_PATTERN.test(claimedAt)
    || Number.isNaN(Date.parse(claimedAt))
  ) {
    return failure('claimed_at must be an RFC 3339 timestamp');
  }

  if (
    typeof value.attempts !== 'number'
    || !Number.isInteger(value.attempts)
    || value.attempts < 1
    || value.attempts > MAX_QUEUE_ATTEMPTS
  ) {
    return failure(
      `attempts must be an integer from 1 to ${MAX_QUEUE_ATTEMPTS}`
    );
  }

  if (value.status === 'executed') {
    if (
      typeof value.execution_price !== 'number' ||
      !Number.isFinite(value.execution_price) ||
      value.execution_price <= 0 ||
      value.execution_price > 1_000_000_000_000_000
    ) {
      return failure('execution_price must be a positive finite number');
    }

    if (
      typeof value.broker_order_ticket !== 'string' ||
      !BROKER_TICKET_PATTERN.test(value.broker_order_ticket)
    ) {
      return failure('broker_order_ticket must be a 1-64 character string');
    }

    if (
      typeof value.executed_volume !== 'number'
      || !Number.isFinite(value.executed_volume)
      || value.executed_volume <= 0
      || value.executed_volume > MAX_TRADE_VOLUME
    ) {
      return failure(
        `executed_volume must be greater than 0 and at most ${MAX_TRADE_VOLUME}`
      );
    }

    return {
      success: true,
      data: {
        worker_id: workerId.data,
        idempotency_key: idempotencyKey.data,
        claimed_at: claimedAt,
        attempts: value.attempts,
        status: 'executed',
        execution_price: value.execution_price,
        executed_volume: value.executed_volume,
        broker_order_ticket: value.broker_order_ticket,
      },
    };
  }

  if (value.status === 'failed') {
    if (typeof value.error_message !== 'string') {
      return failure('error_message must be a string');
    }

    const errorMessage = value.error_message.trim();
    if (
      errorMessage.length < 1 ||
      errorMessage.length > 2000 ||
      errorMessage.includes('\u0000')
    ) {
      return failure('error_message must contain 1-2000 safe characters');
    }

    return {
      success: true,
      data: {
        worker_id: workerId.data,
        idempotency_key: idempotencyKey.data,
        claimed_at: claimedAt,
        attempts: value.attempts,
        status: 'failed',
        error_message: errorMessage,
      },
    };
  }

  return failure('status must be executed or failed');
}

export function parseTelegramNotificationInput(
  value: unknown
): ValidationResult<TelegramNotificationInput> {
  if (!isRecord(value)) {
    return failure('request body must be a JSON object');
  }

  if (typeof value.message !== 'string') {
    return failure('message must be a string');
  }

  const message = value.message.trim();
  if (
    message.length < 1 ||
    message.length > 4096 ||
    message.includes('\u0000')
  ) {
    return failure('message must contain 1-4096 safe characters');
  }

  if (value.chatId === undefined) {
    return { success: true, data: { message } };
  }

  if (
    typeof value.chatId !== 'string' ||
    !TELEGRAM_CHAT_ID_PATTERN.test(value.chatId.trim())
  ) {
    return failure('chatId is invalid');
  }

  return {
    success: true,
    data: {
      chatId: value.chatId.trim(),
      message,
    },
  };
}

export function parseRobotNotificationInput(
  value: unknown
): ValidationResult<RobotNotificationInput> {
  if (!isRecord(value)) {
    return failure('request body must be a JSON object');
  }

  const workerId = parseWorkerId(value.worker_id);
  if (!workerId.success) {
    return workerId;
  }

  if (
    typeof value.event_type !== 'string'
    || !ROBOT_NOTIFICATION_EVENT_TYPES.includes(
      value.event_type as RobotNotificationEventType
    )
  ) {
    return failure('event_type is not supported');
  }

  const eventId = parseIdempotencyKey(value.event_id);
  if (!eventId.success) {
    return failure('event_id must contain 8-128 safe characters');
  }

  if (typeof value.message !== 'string') {
    return failure('message must be a string');
  }
  const message = value.message.trim();
  if (
    message.length < 1
    || message.length > 2000
    || message.includes('\u0000')
  ) {
    return failure('message must contain 1-2000 safe characters');
  }

  return {
    success: true,
    data: {
      worker_id: workerId.data,
      event_type: value.event_type as RobotNotificationEventType,
      event_id: eventId.data,
      message,
    },
  };
}
