import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSingleConfiguredUserId,
  isSafeConfiguredSecret,
  isTelegramChatAuthorized,
  isTradingUserAuthorized,
  parseClaimTradesInput,
  parseCreateTradeInput,
  parseFinalizeTradeInput,
  parseTelegramNotificationInput,
} from '../src/lib/trading/validation.ts';
import { matchesCommittedTerminalResult } from '../src/lib/trading/finalization.ts';
import {
  NotificationDeliveryError,
  settleClaimedNotification,
} from '../src/lib/alerts/cron-delivery.ts';

test('trading user allow-list fails closed', () => {
  const userId = '16fd2706-8baf-433b-82eb-8c7fada847da';
  const otherUserId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  assert.equal(isTradingUserAuthorized(userId, undefined), false);
  assert.equal(isTradingUserAuthorized(userId, otherUserId), false);
  assert.equal(isTradingUserAuthorized(userId, `${userId},not-a-uuid`), false);
  assert.equal(isTradingUserAuthorized(userId, `${otherUserId},${userId}`), false);
  assert.equal(isTradingUserAuthorized(userId, `${userId},`), false);
  assert.equal(isTradingUserAuthorized(userId, userId), true);
  assert.equal(getSingleConfiguredUserId(userId.toUpperCase()), userId);
  assert.equal(getSingleConfiguredUserId(`${userId},`), null);
  assert.equal(getSingleConfiguredUserId('not-a-uuid'), null);
});

test('server secrets and Telegram destinations fail closed', () => {
  assert.equal(isSafeConfiguredSecret('replace_with_a_long_random_value'), false);
  assert.equal(isSafeConfiguredSecret('placeholder-worker-secret-0123456789'), false);
  assert.equal(isSafeConfiguredSecret('test-token-that-is-public-and-long-enough'), false);
  assert.equal(isSafeConfiguredSecret('replacewiththisplaceholdersecret123456789'), false);
  assert.equal(isSafeConfiguredSecret('yoursecretplaceholdervalue1234567890'), false);
  assert.equal(isSafeConfiguredSecret('testsecretplaceholdervalue1234567890'), false);
  assert.equal(isSafeConfiguredSecret('a-secret-with whitespace-123456789012345'), false);
  assert.equal(isSafeConfiguredSecret('c71a915b481f4ffda64ed53e749f1aa0'), true);

  assert.equal(isTelegramChatAuthorized('-1001234567890', undefined), false);
  assert.equal(
    isTelegramChatAuthorized('-1001234567890', '-1009999999999'),
    false,
  );
  assert.equal(
    isTelegramChatAuthorized('-1001234567890', '-1009999999999,-1001234567890'),
    true,
  );
});

test('normalizes and accepts a valid idempotent trade request', () => {
  const result = parseCreateTradeInput({
    symbol: 'btc/usdt',
    marketType: 'crypto',
    action: 'buy',
    volume: 0.01,
    idempotencyKey: 'scalper:user-1:EURUSD:1722222222',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.symbol, 'BTC/USDT');
  }
});

test('rejects unsafe trade actions and volume', () => {
  assert.equal(
    parseCreateTradeInput({
      symbol: 'EURUSD',
      marketType: 'crypto',
      action: 'close-all',
      volume: 0.01,
      idempotencyKey: 'request:12345678',
    }).success,
    false
  );

  assert.equal(
    parseCreateTradeInput({
      symbol: 'EURUSD',
      marketType: 'crypto',
      action: 'buy',
      volume: 1,
      idempotencyKey: 'request:12345678',
    }).success,
    false
  );

  assert.equal(
    parseCreateTradeInput({
      symbol: 'BTCUSDT',
      marketType: 'crypto',
      action: 'buy',
      volume: 0.005,
      idempotencyKey: 'request:12345678',
    }).success,
    false
  );

  assert.equal(
    parseCreateTradeInput({
      symbol: 'EURUSD',
      marketType: 'forex',
      action: 'buy',
      volume: 0.01,
      idempotencyKey: 'request:12345678',
    }).success,
    false
  );
});

test('claim contract uses exact worker_id and limit keys', () => {
  assert.deepEqual(
    parseClaimTradesInput({ worker_id: 'mt5-worker:demo-1', limit: 1 }),
    {
      success: true,
      data: { worker_id: 'mt5-worker:demo-1', limit: 1 },
    }
  );

  assert.equal(
    parseClaimTradesInput({ workerId: 'mt5-worker:demo-1', limit: 1 })
      .success,
    false
  );
  assert.equal(
    parseClaimTradesInput({ worker_id: 'mt5-worker:demo-1', limit: 10 })
      .success,
    false
  );
  assert.equal(
    parseClaimTradesInput({ worker_id: 'mt5-worker:demo-1', limit: 0 })
      .success,
    false
  );
});

test('requires text broker tickets and claim identity on finalization', () => {
  const validExecuted = parseFinalizeTradeInput({
    worker_id: 'mt5-worker:demo-1',
    idempotency_key: 'request:12345678',
    claimed_at: '2026-07-29T01:02:03.123456+00:00',
    attempts: 2,
    status: 'executed',
    execution_price: 1.2345,
    executed_volume: 0.1,
    broker_order_ticket: '9223372036854775808',
  });

  assert.equal(validExecuted.success, true);
  if (validExecuted.success) {
    assert.equal(
      validExecuted.data.claimed_at,
      '2026-07-29T01:02:03.123456+00:00',
    );
    assert.equal(validExecuted.data.attempts, 2);
  }

  assert.equal(
    parseFinalizeTradeInput({
      worker_id: 'mt5-worker:demo-1',
      idempotency_key: 'request:12345678',
      claimed_at: '2026-07-29T01:02:03Z',
      attempts: 2,
      status: 'executed',
      execution_price: 1.2345,
      executed_volume: 0.1,
      broker_order_ticket: 9223372036854775808,
    }).success,
    false
  );
});

test('requires the exact claim generation for executed and failed finalization', () => {
  const baseClaim = {
    worker_id: 'mt5-worker:demo-1',
    idempotency_key: 'request:12345678',
    claimed_at: '2026-07-29T01:02:03Z',
    attempts: 3,
  };

  assert.equal(
    parseFinalizeTradeInput({
      ...baseClaim,
      status: 'failed',
      error_message: 'broker rejected the order',
    }).success,
    true,
  );

  assert.equal(
    parseFinalizeTradeInput({
      ...baseClaim,
      claimed_at: 'not-a-timestamp',
      status: 'failed',
      error_message: 'broker rejected the order',
    }).success,
    false,
  );

  assert.equal(
    parseFinalizeTradeInput({
      ...baseClaim,
      attempts: 0,
      status: 'failed',
      error_message: 'broker rejected the order',
    }).success,
    false,
  );

  assert.equal(
    parseFinalizeTradeInput({
      ...baseClaim,
      attempts: 6,
      status: 'failed',
      error_message: 'broker rejected the order',
    }).success,
    false,
  );

  assert.equal(
    parseFinalizeTradeInput({
      ...baseClaim,
      attempts: 1.5,
      status: 'executed',
      execution_price: 1.2345,
      executed_volume: 0.1,
      broker_order_ticket: '12345',
    }).success,
    false,
  );

  assert.equal(
    parseFinalizeTradeInput({
      worker_id: baseClaim.worker_id,
      idempotency_key: baseClaim.idempotency_key,
      claimed_at: baseClaim.claimed_at,
      status: 'failed',
      error_message: 'broker rejected the order',
    }).success,
    false,
  );

  assert.equal(
    parseFinalizeTradeInput({
      worker_id: baseClaim.worker_id,
      idempotency_key: baseClaim.idempotency_key,
      attempts: baseClaim.attempts,
      status: 'executed',
      execution_price: 1.2345,
      executed_volume: 0.1,
      broker_order_ticket: '12345',
    }).success,
    false,
  );
});

test('recognizes only an identical terminal finalize replay', () => {
  const executedRequest = {
    worker_id: 'mt5-worker:demo-1',
    idempotency_key: 'request:12345678',
    claimed_at: '2026-07-29T01:02:03Z',
    attempts: 2,
    status: 'executed',
    execution_price: 1.2345,
    executed_volume: 0.1,
    broker_order_ticket: '12345',
  };
  const executedRow = {
    status: 'executed',
    execution_price: '1.2345',
    executed_volume: '0.1',
    broker_order_ticket: '12345',
    error_message: null,
    executed_at: '2026-07-29T01:02:04Z',
  };

  assert.equal(
    matchesCommittedTerminalResult(executedRow, executedRequest),
    true,
  );
  assert.equal(
    matchesCommittedTerminalResult(
      { ...executedRow, broker_order_ticket: '54321' },
      executedRequest,
    ),
    false,
  );
  assert.equal(
    matchesCommittedTerminalResult(
      { ...executedRow, executed_volume: '0.2' },
      executedRequest,
    ),
    false,
  );

  const failedRequest = {
    worker_id: 'mt5-worker:demo-1',
    idempotency_key: 'request:12345678',
    claimed_at: '2026-07-29T01:02:03Z',
    attempts: 2,
    status: 'failed',
    error_message: 'broker rejected the order',
  };
  assert.equal(
    matchesCommittedTerminalResult(
      {
        status: 'failed',
        execution_price: null,
        executed_volume: null,
        broker_order_ticket: null,
        executed_at: null,
        error_message: 'broker rejected the order',
      },
      failedRequest,
    ),
    true,
  );
  assert.equal(
    matchesCommittedTerminalResult(executedRow, failedRequest),
    false,
  );
});

test('bounds Telegram destinations and messages', () => {
  assert.equal(
    parseTelegramNotificationInput({
      chatId: '-1001234567890',
      message: 'Alert',
    }).success,
    true
  );
  assert.equal(
    parseTelegramNotificationInput({
      chatId: '@arbitrary-channel',
      message: 'Alert',
    }).success,
    false
  );
  assert.equal(
    parseTelegramNotificationInput({
      chatId: '-1001234567890',
      message: 'x'.repeat(4097),
    }).success,
    false
  );
});

test('cron treats configured no-send and successful delivery as processed', async () => {
  let rollbackCalls = 0;
  const rollback = async () => {
    rollbackCalls += 1;
    return true;
  };

  assert.deepEqual(
    await settleClaimedNotification({ rollback }),
    { processed: true, attempted: false },
  );
  assert.deepEqual(
    await settleClaimedNotification({
      send: async () => ({ ok: true, status: 200 }),
      rollback,
    }),
    { processed: true, attempted: true },
  );
  assert.equal(rollbackCalls, 0);
});

test('cron rolls a claim back after Telegram returns non-OK', async () => {
  let rollbackCalls = 0;
  const result = await settleClaimedNotification({
    send: async () => ({ ok: false, status: 502 }),
    rollback: async () => {
      rollbackCalls += 1;
      return true;
    },
  });

  assert.equal(result.processed, false);
  assert.equal(rollbackCalls, 1);
  if (!result.processed) {
    assert.equal(result.rollbackApplied, true);
    assert.ok(result.sendError instanceof NotificationDeliveryError);
    assert.equal(result.sendError.status, 502);
  }
});

test('cron rolls a claim back after Telegram transport throws', async () => {
  const transportError = new Error('timeout');
  const result = await settleClaimedNotification({
    send: async () => {
      throw transportError;
    },
    rollback: async () => false,
  });

  assert.equal(result.processed, false);
  if (!result.processed) {
    assert.equal(result.rollbackApplied, false);
    assert.equal(result.sendError, transportError);
  }
});
