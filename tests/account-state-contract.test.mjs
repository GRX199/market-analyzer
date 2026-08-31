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
  assert.match(userStore, /isTransientAuthNetworkError/);
  assert.match(userStore, /AUTH_NETWORK_RETRY_DELAY_MS/);
  assert.match(userStore, /await getVerifiedAuthUser\(\)/);
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

test('Base UI triggers use render composition and menu labels stay grouped', async () => {
  const [navbar, alerts, portfolio] = await Promise.all([
    source('src/components/layout/navbar.tsx'),
    source('src/app/alerts/page.tsx'),
    source('src/app/portfolio/page.tsx'),
  ]);

  for (const component of [navbar, alerts, portfolio]) {
    assert.doesNotMatch(component, /asChild/);
  }
  assert.match(navbar, /<DropdownMenuGroup>[\s\S]*<DropdownMenuLabel/);
});

test('workspace navigation is grouped and mobile-first without duplicating account state', async () => {
  const [sidebar, dashboardLayout, mobileNav, login, commandPalette, watcher] = await Promise.all([
    source('src/components/layout/sidebar.tsx'),
    source('src/components/layout/dashboard-layout.tsx'),
    source('src/components/layout/mobile-bottom-nav.tsx'),
    source('src/app/login/page.tsx'),
    source('src/components/common/command-palette.tsx'),
    source('src/components/common/alert-watcher.tsx'),
  ]);

  assert.match(sidebar, /navSections/);
  assert.match(sidebar, /Pantau pasar/);
  assert.match(sidebar, /Analisis & trading/);
  assert.match(dashboardLayout, /<MobileBottomNav \/>/);
  assert.match(mobileNav, /aria-label="Navigasi utama mobile"/);
  assert.match(login, /showPassword/);
  assert.match(login, /Row Level Security aktif/);
  assert.match(commandPalette, /Aksi cepat/);
  assert.match(commandPalette, /Periksa kesiapan robot/);
  assert.match(sidebar, /href: '\/forex-robot', label: 'Robot Forex'/);
  assert.match(mobileNav, /href: '\/forex-robot', label: 'Forex'/);
  assert.match(watcher, /const shouldBootstrapAccount = pathname !== '\/login'/);
  assert.match(watcher, /\[loadFromSupabase, shouldBootstrapAccount\]/);
  assert.doesNotMatch(watcher, /\[loadFromSupabase, pathname\]/);
  assert.doesNotMatch(dashboardLayout, /Menyiapkan ruang kerja/);
});
