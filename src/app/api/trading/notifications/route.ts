import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import {
  authorizeWorkerRequest,
  readJsonBody,
  RequestBodyError,
} from '@/lib/trading/http';
import {
  getSingleConfiguredUserId,
  isSafeConfiguredSecret,
  isTelegramChatAuthorized,
  parseRobotNotificationInput,
  type RobotNotificationEventType,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';

const EVENT_LABELS: Record<RobotNotificationEventType, string> = {
  startup: 'ROBOT AKTIF',
  trade_opened: 'POSISI DIBUKA',
  trade_closed: 'POSISI DITUTUP',
  break_even: 'BREAK-EVEN AKTIF',
  attention: 'PERLU PERHATIAN',
  shutdown: 'ROBOT BERHENTI',
};

function json(
  body: Record<string, unknown>,
  status: number,
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const authorization = authorizeWorkerRequest(request);
  if (!authorization.authorized) {
    return authorization.misconfigured
      ? json({ error: 'Trade worker authentication is not configured' }, 503)
      : json({ error: 'Unauthorized' }, 401);
  }

  const ownerUserId = getSingleConfiguredUserId(
    process.env.TRADING_ALLOWED_USER_IDS,
  );
  const telegramUserId = getSingleConfiguredUserId(
    process.env.TELEGRAM_ALLOWED_USER_IDS,
  );
  if (!ownerUserId || telegramUserId !== ownerUserId) {
    return json({ error: 'Telegram owner is not configured correctly' }, 503);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Invalid request body' }, 400);
  }

  const validated = parseRobotNotificationInput(body);
  if (!validated.success) {
    return json({ error: validated.error }, 400);
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return json({ error: 'Telegram service is not configured' }, 503);
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('telegram_chat_id')
    .eq('id', ownerUserId)
    .maybeSingle();
  if (profileError) {
    console.error('Failed to load robot Telegram destination', {
      code: profileError.code,
    });
    return json({ error: 'Failed to load notification settings' }, 500);
  }

  const chatId = String(profile?.telegram_chat_id ?? '').trim();
  if (!isTelegramChatAuthorized(chatId, process.env.TELEGRAM_ALLOWED_CHAT_IDS)) {
    return json({ error: 'Telegram destination is not authorized' }, 503);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!isSafeConfiguredSecret(botToken)) {
    return json({ error: 'Telegram service is not configured' }, 503);
  }

  const text = [
    `[MARKET ANALYZER DEMO] ${EVENT_LABELS[validated.data.event_type]}`,
    validated.data.message,
  ].join('\n');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      console.error('Telegram rejected a robot notification', {
        status: response.status,
        eventType: validated.data.event_type,
        eventId: validated.data.event_id,
      });
      return json({ error: 'Telegram rejected the notification' }, 502);
    }
  } catch {
    console.error('Robot Telegram notification request failed', {
      eventType: validated.data.event_type,
      eventId: validated.data.event_id,
    });
    return json({ error: 'Telegram service is unavailable' }, 502);
  }

  return json({ delivered: true, event_id: validated.data.event_id }, 200);
}
