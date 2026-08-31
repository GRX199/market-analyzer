import { NextResponse } from 'next/server';

import {
  createServerSupabaseClient,
  getSupabaseAdminClient,
} from '@/lib/supabase/server';
import {
  NotificationDeliveryError,
  settleClaimedNotification,
} from '@/lib/alerts/cron-delivery';
import { readJsonBody, RequestBodyError } from '@/lib/trading/http';
import {
  isSafeConfiguredSecret,
  isTelegramChatAuthorized,
  isTradingUserAuthorized,
} from '@/lib/trading/validation';
import { getAssetPrice } from '@/services/market-data';

export const runtime = 'nodejs';

interface AlertTriggerInput {
  observedPrice: number;
}

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  alert_type: 'price_above' | 'price_below';
  target_value: number;
  is_active: boolean;
  is_triggered: boolean;
  triggered_at: string | null;
  trigger_count: number;
}

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseInput(value: unknown): AlertTriggerInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const observedPrice = Number(
    (value as Record<string, unknown>).observedPrice,
  );
  return Number.isFinite(observedPrice) && observedPrice > 0
    ? { observedPrice }
    : null;
}

function parseAlertRow(value: unknown): AlertRow | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const targetValue = Number(row.target_value);
  const triggerCount = Number(row.trigger_count);
  if (
    typeof row.id !== 'string'
    || typeof row.user_id !== 'string'
    || typeof row.symbol !== 'string'
    || (row.alert_type !== 'price_above' && row.alert_type !== 'price_below')
    || !Number.isFinite(targetValue)
    || !Number.isInteger(triggerCount)
    || typeof row.is_active !== 'boolean'
    || typeof row.is_triggered !== 'boolean'
    || (row.triggered_at !== null && typeof row.triggered_at !== 'string')
  ) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    symbol: row.symbol,
    alert_type: row.alert_type,
    target_value: targetValue,
    is_active: row.is_active,
    is_triggered: row.is_triggered,
    triggered_at: row.triggered_at,
    trigger_count: triggerCount,
  };
}

function responseAlert(alert: AlertRow) {
  return {
    id: alert.id,
    isActive: alert.is_active,
    isTriggered: alert.is_triggered,
    triggeredAt: alert.triggered_at,
    triggerCount: alert.trigger_count,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return json({ success: false, error: 'Authentication required' }, 401);
    }
    userId = user.id;
  } catch {
    return json(
      { success: false, error: 'Authentication service is unavailable' },
      503,
    );
  }

  const { id } = await params;
  if (!id || id.length > 128) {
    return json({ success: false, error: 'Invalid alert ID' }, 400);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return json({ success: false, error: error.message }, error.status);
    }
    return json({ success: false, error: 'Invalid request body' }, 400);
  }
  const input = parseInput(body);
  if (!input) {
    return json({ success: false, error: 'Invalid observed price' }, 400);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ success: false, error: 'Alert service is not configured' }, 503);
  }

  const { data: rawAlert, error: alertError } = await admin
    .from('alerts')
    .select(
      'id,user_id,symbol,alert_type,target_value,is_active,is_triggered,triggered_at,trigger_count',
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (alertError) {
    console.error('Failed to load alert for atomic trigger', {
      code: alertError.code,
    });
    return json({ success: false, error: 'Failed to load alert' }, 500);
  }
  if (!rawAlert) {
    return json({ success: false, error: 'Alert not found' }, 404);
  }

  const alert = parseAlertRow(rawAlert);
  if (!alert) {
    return json(
      { success: false, error: 'Alert is not a valid price alert' },
      400,
    );
  }
  if (!alert.is_active || alert.is_triggered) {
    return json({
      success: true,
      claimed: false,
      conditionMet: true,
      alert: responseAlert(alert),
    }, 200);
  }

  // The browser observation is only a hint to invoke this endpoint. Recheck
  // the market price server-side before any durable state transition.
  let serverPrice: number;
  try {
    const asset = await getAssetPrice(alert.symbol);
    if (!asset || !Number.isFinite(asset.price) || asset.price <= 0) {
      return json(
        { success: false, error: 'Server market price is unavailable' },
        503,
      );
    }
    serverPrice = asset.price;
  } catch {
    return json(
      { success: false, error: 'Server market price is unavailable' },
      503,
    );
  }

  const conditionMet = alert.alert_type === 'price_above'
    ? serverPrice >= alert.target_value
    : serverPrice <= alert.target_value;
  if (!conditionMet) {
    return json({
      success: true,
      claimed: false,
      conditionMet: false,
      serverPrice,
      observedPrice: input.observedPrice,
    }, 200);
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('Failed to load alert notification destination', {
      code: profileError.code,
    });
    return json(
      { success: false, error: 'Failed to load notification settings' },
      500,
    );
  }

  const claimedAt = new Date().toISOString();
  const claimedTriggerCount = alert.trigger_count + 1;
  const { data: rawClaimed, error: claimError } = await admin
    .from('alerts')
    .update({
      is_active: false,
      is_triggered: true,
      triggered_at: claimedAt,
      trigger_count: claimedTriggerCount,
    })
    .eq('id', alert.id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_triggered', false)
    .eq('trigger_count', alert.trigger_count)
    .select(
      'id,user_id,symbol,alert_type,target_value,is_active,is_triggered,triggered_at,trigger_count',
    )
    .maybeSingle();
  if (claimError) {
    console.error('Failed to claim alert trigger', { code: claimError.code });
    return json({ success: false, error: 'Failed to claim alert' }, 500);
  }
  const claimed = parseAlertRow(rawClaimed);
  if (!claimed) {
    const { data: current } = await admin
      .from('alerts')
      .select(
        'id,user_id,symbol,alert_type,target_value,is_active,is_triggered,triggered_at,trigger_count',
      )
      .eq('id', alert.id)
      .eq('user_id', userId)
      .maybeSingle();
    const currentAlert = parseAlertRow(current);
    return json({
      success: true,
      claimed: false,
      conditionMet: true,
      ...(currentAlert ? { alert: responseAlert(currentAlert) } : {}),
    }, 200);
  }

  const rollback = async () => {
    const { data, error } = await admin
      .from('alerts')
      .update({
        is_active: alert.is_active,
        is_triggered: alert.is_triggered,
        triggered_at: alert.triggered_at,
        trigger_count: alert.trigger_count,
      })
      .eq('id', alert.id)
      .eq('user_id', userId)
      .eq('is_active', false)
      .eq('is_triggered', true)
      .eq('triggered_at', claimedAt)
      .eq('trigger_count', claimedTriggerCount)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = typeof profile?.telegram_chat_id === 'string'
    ? profile.telegram_chat_id
    : null;
  const shouldSendTelegram = (
    isTradingUserAuthorized(userId, process.env.TELEGRAM_ALLOWED_USER_IDS)
    && isSafeConfiguredSecret(botToken)
    && chatId !== null
    && isTelegramChatAuthorized(
      chatId,
      process.env.TELEGRAM_ALLOWED_CHAT_IDS,
    )
  );
  const comparison = alert.alert_type === 'price_above'
    ? 'crossed above'
    : 'crossed below';
  const telegramMessage = [
    'MARKET ALERT',
    `Asset: ${alert.symbol}`,
    `Price: ${serverPrice}`,
    `Condition: ${comparison} ${alert.target_value}`,
    'Market Analyzer',
  ].join('\n');

  const deliveryResult = await settleClaimedNotification({
    send: shouldSendTelegram
      ? () => fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: telegramMessage,
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        )
      : undefined,
    rollback,
  });

  if (!deliveryResult.processed) {
    console.error('Atomic client alert delivery failed; rollback attempted', {
      alertId: alert.id,
      status: deliveryResult.sendError instanceof NotificationDeliveryError
        ? deliveryResult.sendError.status
        : 'network_error',
      rollbackApplied: deliveryResult.rollbackApplied,
      rollbackFailed: Boolean(deliveryResult.rollbackError),
    });
    return json(
      {
        success: false,
        error: 'Notification delivery failed; alert claim rollback was attempted',
      },
      502,
    );
  }

  return json({
    success: true,
    claimed: true,
    conditionMet: true,
    serverPrice,
    telegramDelivered: shouldSendTelegram,
    alert: responseAlert(claimed),
  }, 200);
}
