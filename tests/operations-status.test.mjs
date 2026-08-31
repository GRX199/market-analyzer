import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('operations status is authenticated, cache-free, and exposes booleans only', async () => {
  const route = await source('src/app/api/operations/status/route.ts');

  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.match(route, /isTradingUserAuthorized/);
  assert.match(route, /isSafeConfiguredSecret/);
  assert.match(route, /canQueueOrders:/);
  assert.doesNotMatch(route, /workerToken:\s*process\.env/);
  assert.doesNotMatch(route, /serviceRoleKey:\s*process\.env/);
});

test('fabricated economic calendar is retired from navigation', async () => {
  const [sidebar, calendar] = await Promise.all([
    source('src/components/layout/sidebar.tsx'),
    source('src/app/calendar/page.tsx'),
  ]);

  assert.doesNotMatch(sidebar, /href: '\/calendar'/);
  assert.doesNotMatch(calendar, /MOCK_EVENTS|Non-Farm Employment/);
  assert.match(calendar, /redirect\('\/operations'\)/);
});

test('signed-out account bootstrap is a normal state, not an error toast', async () => {
  const userStore = await source('src/stores/user-store.ts');

  assert.match(userStore, /supabase\.auth\.getSession\(\)/);
  assert.match(userStore, /if \(!session\)/);
  assert.match(userStore, /accountLoadError: null/);
});
