import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getSingleConfiguredUserId,
  isSafeConfiguredSecret,
  isTradingUserAuthorized,
} from '@/lib/trading/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function hasValue(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return !/^(?:replace|your|change[-_]?me|example|placeholder)/i.test(value.trim());
}

function hasValidTelegramChatAllowList(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 && entries.every((entry) => /^-?[1-9][0-9]{4,19}$/.test(entry));
}

export async function GET() {
  let userId: string;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return json({ error: 'Authentication required' }, 401);
    }
    userId = user.id;
  } catch {
    return json({ error: 'Authentication service is unavailable' }, 503);
  }

  const serverTradingEnabled = process.env.TRADING_ENABLED === 'true';
  const browserTradingEnabled = process.env.NEXT_PUBLIC_TRADING_ENABLED === 'true';
  const ownerUserId = getSingleConfiguredUserId(process.env.TRADING_ALLOWED_USER_IDS);
  const ownerAuthorized = isTradingUserAuthorized(
    userId,
    process.env.TRADING_ALLOWED_USER_IDS,
  );
  const workerTokenConfigured = isSafeConfiguredSecret(process.env.TRADING_WORKER_TOKEN);
  const adminCredentialConfigured = isSafeConfiguredSecret(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const switchesAligned = serverTradingEnabled === browserTradingEnabled;

  return json({
    checkedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    authentication: {
      verified: true,
      ownerConfigured: ownerUserId !== null,
      ownerAuthorized,
    },
    trading: {
      serverEnabled: serverTradingEnabled,
      browserEnabled: browserTradingEnabled,
      switchesAligned,
      workerTokenConfigured,
      adminCredentialConfigured,
      canQueueOrders:
        serverTradingEnabled
        && browserTradingEnabled
        && switchesAligned
        && ownerAuthorized
        && workerTokenConfigured
        && adminCredentialConfigured,
    },
    integrations: {
      cronSecretConfigured: isSafeConfiguredSecret(process.env.CRON_SECRET),
      telegramConfigured:
        isSafeConfiguredSecret(process.env.TELEGRAM_BOT_TOKEN)
        && hasValidTelegramChatAllowList(process.env.TELEGRAM_ALLOWED_CHAT_IDS)
        && getSingleConfiguredUserId(process.env.TELEGRAM_ALLOWED_USER_IDS) === userId.toLowerCase(),
      aiSummaryConfigured: isSafeConfiguredSecret(process.env.GEMINI_API_KEY),
      stockRealtimeConfigured: hasValue(process.env.NEXT_PUBLIC_FINNHUB_API_KEY),
    },
    robot: {
      processVisibility: 'external',
      recommendedRuntime: 'combined-demo',
    },
  }, 200);
}
