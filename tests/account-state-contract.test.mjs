import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('session bootstrap preserves cached account identity only until verification', async () => {
  const [watcher, userStore] = await Promise.all([
    source('src/components/common/alert-watcher.tsx'),
    source('src/stores/user-store.ts'),
  ]);

  const bootstrapStart = watcher.indexOf('useUserStore.setState({');
  const bootstrapEnd = watcher.indexOf('});', bootstrapStart);
  const bootstrap = watcher.slice(bootstrapStart, bootstrapEnd);

  assert.doesNotMatch(bootstrap, /authenticatedUserId:\s*null/);
  assert.match(bootstrap, /isAuthenticated:\s*false/);
  assert.match(userStore, /const isSameAccount = previousAccountId === userId/);
  assert.match(userStore, /user:\s*profile/);
  assert.match(userStore, /metadata\.display_name/);
});

test('settings never fabricates an account and profile updates stay owner-bound', async () => {
  const settings = await source('src/app/settings/page.tsx');

  assert.doesNotMatch(settings, /local-user-1|admin@marketanalyzer\.app|['"]Admin['"]/);
  assert.match(settings, /supabase\.auth\.updateUser/);
  assert.match(settings, /data\.user\?\.id !== user\.id/);
  assert.match(settings, /readOnly/);
});

test('local backup import cannot replace authentication state or cross accounts', async () => {
  const userStore = await source('src/stores/user-store.ts');
  const importStart = userStore.indexOf('importData: (data) =>');
  const importEnd = userStore.indexOf('// Supabase Sync Implementations', importStart);
  const importAction = userStore.slice(importStart, importEnd);

  assert.match(importAction, /backup\.ownerUserId/);
  assert.match(importAction, /currentUserId/);
  assert.match(importAction, /portfolioHistory/);
  assert.doesNotMatch(importAction, /\.\.\.state|isAuthenticated|authenticatedUserId:\s*/);
});
