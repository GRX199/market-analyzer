import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('worker claim is kill-switched and bound to the configured owner', async () => {
  const [claimRoute, validation] = await Promise.all([
    source('src/app/api/trades/claim/route.ts'),
    source('src/lib/trading/validation.ts'),
  ]);

  assert.match(claimRoute, /process\.env\.TRADING_ENABLED !== 'true'/);
  assert.match(claimRoute, /getSingleConfiguredUserId/);
  assert.match(claimRoute, /owner_user_id: ownerUserId/);
  assert.match(claimRoute, /findExistingWorkerClaim/);
  assert.match(claimRoute, /\.eq\('status', 'processing'\)/);
  assert.match(claimRoute, /\.eq\('worker_id', workerId\)/);
  assert.match(claimRoute, /recovered: true/);
  assert.match(validation, /WORKER_CLAIM_LIMIT = 1/);
  assert.match(validation, /value\.limit !== WORKER_CLAIM_LIMIT/);
});

test('privileged Supabase access does not fall back to placeholder credentials', async () => {
  const serverClient = await source('src/lib/supabase/server.ts');

  assert.match(serverClient, /isSafeConfiguredSecret\(serviceRoleKey\)/);
  assert.doesNotMatch(serverClient, /serviceRoleKey \|\| anonKey/);
});

test('enqueue authenticates and authorizes before exposing its kill switch', async () => {
  const tradeRoute = await source('src/app/api/trades/route.ts');
  const postHandler = tradeRoute.slice(tradeRoute.indexOf('export async function POST'));

  const authPosition = postHandler.indexOf('supabase.auth.getUser()');
  const ownerPosition = postHandler.indexOf('isTradingUserAuthorized(');
  const killSwitchPosition = postHandler.indexOf(
    "process.env.TRADING_ENABLED !== 'true'",
  );
  const bodyPosition = postHandler.indexOf('readJsonBody(request)');

  assert.ok(authPosition >= 0 && authPosition < killSwitchPosition);
  assert.ok(ownerPosition >= 0 && ownerPosition < killSwitchPosition);
  assert.ok(killSwitchPosition >= 0 && killSwitchPosition < bodyPosition);
});

test('trade history remains owner-scoped without requiring execution permission', async () => {
  const tradeRoute = await source('src/app/api/trades/route.ts');
  const getHandler = tradeRoute.slice(
    tradeRoute.indexOf('export async function GET'),
    tradeRoute.indexOf('export async function POST'),
  );

  assert.match(getHandler, /supabase\.auth\.getUser\(\)/);
  assert.match(getHandler, /\.eq\('user_id', userId\)/);
  assert.doesNotMatch(getHandler, /isTradingUserAuthorized/);
});

test('queue migrations remove owner-agnostic claims and defend queue inputs', async () => {
  const [baseline, upgrade, sequential] = await Promise.all([
    source('supabase/migrations/20260729000100_secure_trade_queue.sql'),
    source(
      'supabase/migrations/20260729000300_harden_owner_claims_and_notifications.sql',
    ),
    source(
      'supabase/migrations/20260801000400_enforce_single_inflight_trade.sql',
    ),
  ]);

  for (const migration of [baseline, upgrade]) {
    assert.match(migration, /owner_user_id UUID/);
    assert.match(migration, /queued\.user_id = normalized_owner_user_id/);
    assert.match(
      migration,
      /queued\.idempotency_key ~ '\^\[A-Za-z0-9\]/,
    );
    assert.match(migration, /scanner_claim_version/);
  }

  assert.match(
    upgrade,
    /DROP FUNCTION IF EXISTS public\.claim_auto_trades\(TEXT, INTEGER\)/,
  );
  assert.match(sequential, /owner_user_id UUID/);
  assert.match(sequential, /queued\.user_id = normalized_owner_user_id/);
  assert.match(sequential, /COALESCE\(\$3, 1\) <> 1/);
  assert.match(sequential, /LIMIT 1/);
  assert.match(sequential, /pg_advisory_xact_lock/);
  assert.match(sequential, /active\.status = 'processing'/);
  assert.match(
    sequential,
    /CREATE UNIQUE INDEX IF NOT EXISTS auto_trades_one_processing_per_user_uidx[\s\S]*WHERE status = 'processing'/,
  );
});

test('notification rollback uses a persistent scanner version fence', async () => {
  const cronRoute = await source('src/app/api/cron/check-alerts/route.ts');

  assert.match(cronRoute, /scanner_claim_version: claimedVersion/);
  assert.match(cronRoute, /\.eq\('scanner_claim_version', claimedVersion\)/);
  assert.doesNotMatch(cronRoute, /parse_mode:\s*'Markdown'/);
});

test('background alert cron validates Telegram delivery before claiming state', async () => {
  const cronRoute = await source('src/app/api/cron/check-alerts/route.ts');
  const loopStart = cronRoute.indexOf('for (const alert of triggeredAlerts)');
  const deliveryGuard = cronRoute.indexOf(
    'if (!hasSafeBotToken || !hasAuthorizedDestination)',
    loopStart,
  );
  const claimStart = cronRoute.indexOf('let claimedId:', loopStart);

  assert.ok(loopStart >= 0);
  assert.ok(deliveryGuard > loopStart && deliveryGuard < claimStart);
  assert.match(cronRoute, /alert left active/);
  assert.doesNotMatch(cronRoute, /send:\s*shouldSendTelegram\s*\?/);
});

test('browser alerts use the server-side atomic trigger instead of direct Telegram', async () => {
  const [monitor, triggerRoute, userStore, watcher, realtimeStore] = await Promise.all([
    source('src/hooks/use-alerts-monitor.ts'),
    source('src/app/api/alerts/[id]/trigger/route.ts'),
    source('src/stores/user-store.ts'),
    source('src/components/common/alert-watcher.tsx'),
    source('src/stores/realtime-store.ts'),
  ]);

  assert.match(monitor, /\/api\/alerts\/\$\{encodeURIComponent\(alertId\)\}\/trigger/);
  assert.doesNotMatch(monitor, /\/api\/notify\/telegram/);
  assert.match(triggerRoute, /getAssetPrice\(alert\.symbol\)/);
  assert.match(triggerRoute, /\.eq\('is_triggered', false\)/);
  assert.match(triggerRoute, /settleClaimedNotification/);
  assert.match(watcher, /realtime\.subscribeSymbol\(symbol, marketType\)/);
  assert.match(watcher, /realtime\.connectCrypto\(\)/);
  assert.match(realtimeStore, /stockSubscriptionCounts/);
  assert.match(realtimeStore, /forexSubscriptionCounts/);

  const mirrorStart = userStore.indexOf('markAlertTriggered:');
  const mirrorEnd = userStore.indexOf('addPosition:', mirrorStart);
  const mirrorAction = userStore.slice(mirrorStart, mirrorEnd);
  assert.doesNotMatch(mirrorAction, /syncAlertToSupabase\(updatedAlert\)/);
});

test('forex polling batches the full symbol set within the server limit', async () => {
  const [forexRoute, realtimeStore] = await Promise.all([
    source('src/app/api/proxy/forex/route.ts'),
    source('src/stores/realtime-store.ts'),
  ]);

  assert.match(forexRoute, /MAX_SYMBOLS_PER_REQUEST = 20/);
  assert.match(realtimeStore, /FOREX_REQUEST_BATCH_SIZE = 20/);
  assert.match(realtimeStore, /symbols\.slice\(index, index \+ FOREX_REQUEST_BATCH_SIZE\)/);
  assert.match(realtimeStore, /Promise\.allSettled/);
  assert.match(realtimeStore, /if \(isForexPolling\) return/);
  assert.match(realtimeStore, /forexPollingAbortController\?\.abort\(\)/);
  assert.doesNotMatch(realtimeStore, /&_t=\$\{Date\.now\(\)\}/);
});

test('terminal finalize supports identical response-loss replay', async () => {
  const finalizeRoute = await source('src/app/api/trades/[id]/route.ts');

  assert.match(finalizeRoute, /matchesCommittedTerminalResult/);
  assert.match(finalizeRoute, /replayed: true/);
  assert.match(finalizeRoute, /replayed: false/);
});

test('requested and broker-filled volumes remain separate and validated', async () => {
  const [migration, finalizeRoute, validation] = await Promise.all([
    source('supabase/migrations/20260903000100_track_executed_trade_volume.sql'),
    source('src/app/api/trades/[id]/route.ts'),
    source('src/lib/trading/validation.ts'),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS executed_volume NUMERIC/);
  assert.match(migration, /executed_volume > 0 AND executed_volume <= 100/);
  assert.match(finalizeRoute, /executed_volume: validated\.data\.executed_volume/);
  assert.match(validation, /executed_volume must be greater than 0/);
});

test('robot Telegram notifications are worker-authenticated and owner-bound', async () => {
  const [route, proxy] = await Promise.all([
    source('src/app/api/trading/notifications/route.ts'),
    source('src/proxy.ts'),
  ]);

  assert.match(route, /authorizeWorkerRequest\(request\)/);
  assert.match(route, /TRADING_ALLOWED_USER_IDS/);
  assert.match(route, /TELEGRAM_ALLOWED_USER_IDS/);
  assert.match(route, /TELEGRAM_ALLOWED_CHAT_IDS/);
  assert.match(route, /parseRobotNotificationInput/);
  assert.match(route, /\.eq\('id', ownerUserId\)/);
  assert.match(route, /disable_web_page_preview: true/);
  assert.doesNotMatch(route, /parse_mode/);
  assert.match(proxy, /pathname === '\/api\/trading\/notifications'/);
  assert.match(proxy, /request\.method === 'POST'/);
});
