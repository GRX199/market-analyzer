import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readJsonBody, RequestBodyError } from '@/lib/trading/http';
import {
  isSafeConfiguredSecret,
  isTelegramChatAuthorized,
  isTradingUserAuthorized,
  parseTelegramNotificationInput,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse<Record<string, unknown>> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  let userId: string;
  try {
    supabase = await createServerSupabaseClient();
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
      503
    );
  }

  if (
    !isTradingUserAuthorized(
      userId,
      process.env.TELEGRAM_ALLOWED_USER_IDS
    )
  ) {
    return json(
      { success: false, error: 'User is not authorized for Telegram notifications' },
      403
    );
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

  const validated = parseTelegramNotificationInput(body);
  if (!validated.success) {
    return json({ success: false, error: validated.error }, 400);
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to load Telegram notification destination', {
      code: profileError.code,
    });
    return json(
      { success: false, error: 'Failed to load notification settings' },
      500
    );
  }

  const storedDestination = parseTelegramNotificationInput({
    chatId: profile?.telegram_chat_id,
    message: validated.data.message,
  });
  if (!storedDestination.success || !storedDestination.data.chatId) {
    return json(
      { success: false, error: 'Telegram chat is not configured' },
      400
    );
  }

  if (
    validated.data.chatId !== undefined &&
    validated.data.chatId !== storedDestination.data.chatId
  ) {
    return json(
      { success: false, error: 'Telegram destination is not authorized' },
      403
    );
  }

  const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  if (!allowedChatIds?.trim()) {
    return json(
      { success: false, error: 'Telegram destination allow-list is not configured' },
      503
    );
  }
  if (!isTelegramChatAuthorized(storedDestination.data.chatId, allowedChatIds)) {
    return json(
      { success: false, error: 'Telegram destination is not authorized' },
      403
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!isSafeConfiguredSecret(botToken)) {
    return json(
      { success: false, error: 'Telegram service is not configured' },
      503
    );
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: storedDestination.data.chatId,
        text: validated.data.message,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error('Telegram rejected a notification request', {
        status: response.status,
      });
      return json(
        { success: false, error: 'Telegram rejected the notification' },
        502
      );
    }

    return json({ success: true }, 200);
  } catch {
    console.error('Telegram notification request failed');
    return json(
      { success: false, error: 'Telegram service is unavailable' },
      502
    );
  }
}
