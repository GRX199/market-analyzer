// Isolated visual/interaction regression. Real pages and stores, synthetic data, no live services.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const out = path.join(root, 'local-reports/workspace-ui'), mocks = path.join(root, 'tests/fixtures/workspace-ui-mocks.jsx');
const compiler = webpack({ mode: 'development', devtool: false, context: root,
  entry: './tests/fixtures/workspace-ui-entry.jsx', output: { path: out, filename: 'fixture.js' },
  experiments: { topLevelAwait: true },
  plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }), new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development', NEXT_PUBLIC_TRADING_ENABLED: 'false', NEXT_PUBLIC_CRYPTO_ENTRIES_ENABLED: 'false' }) })],
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], alias: {
    'next/link$': mocks, 'next/navigation$': mocks, '@/lib/supabase/client$': mocks,
    '@/stores/realtime-store$': mocks, '@/components/scalping/scalper-robot-provider$': mocks, '@': path.join(root, 'src'),
  } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.join(root, 'tests/fixtures/news-ui-loader.cjs') }] },
});
await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve())));
const css = await postcss([tailwind({ base: root })]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
const bundle = await readFile(path.join(out, 'fixture.js'));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="id"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace UI fixture — synthetic data</title><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const playwright = process.env.PLAYWRIGHT_TEST_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_TEST_MODULE).href) : await import('playwright');
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [], findings = [], checks = [];
  page.on('pageerror', error => errors.push({ path: new URL(page.url()).pathname, error: error.message }));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.addInitScript(() => { window.WebSocket = class extends EventTarget { static OPEN = 1; static CLOSED = 3; readyState = 3; close() {} send() {} }; });
  await page.goto(origin + '/dashboard');
  await page.waitForFunction(() => window.fixture?.ready);
  await page.locator('#workspace-content h1').waitFor();
  const paths = await page.evaluate(() => window.fixture.pages);
  // Every routed page at required widths plus the in-between breakpoints.
  for (const width of [360, 390, 640, 768, 900, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const pathname of paths) {
      await page.evaluate(pathname => { history.pushState(null, '', pathname); dispatchEvent(new PopStateEvent('popstate')); }, pathname);
      await page.locator('main h1:visible').first().waitFor();
      await page.waitForTimeout(60);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        overflowElements: document.documentElement.scrollWidth > innerWidth + 1 ? [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0).slice(0, 5).map(el => ({ tag: el.tagName, classes: el.className })) : [],
        smallControls: [...document.querySelectorAll('button, [role="tab"], [role="combobox"]')].flatMap(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && (r.width < 43.5 || r.height < 43.5)
            ? [{ label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 50), width: r.width, height: r.height }] : [];
        }),
      }));
      checks.push({ pathname, width, ...layout });
      if (layout.overflow > 1 || layout.smallControls.length) findings.push({ pathname, width, ...layout });
      if ([360, 768, 1024, 1440].includes(width) && ['/dashboard', '/signals', '/market', '/login', '/compare', '/asset/XAU%2FUSD'].includes(pathname)) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(out, `${pathname.slice(1).replaceAll('/', '-')}-${width}.png`), animations: 'disabled' });
      }
    }
    console.log(`Checked ${paths.length} pages at ${width}px`);
  }
  console.log(JSON.stringify({ checks: checks.length, findings, errors: [...new Set(errors.map(item => item.error))] }, null, 2));
  await writeFile(path.join(out, 'responsive-report.json'), JSON.stringify({ checks, findings, errors }, null, 2));
  assert.deepEqual(errors, [], 'page runtime errors');
  assert.deepEqual(findings, [], 'responsive overflow / target sizes');

  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + '/signals');
    await page.locator('summary').filter({ hasText: 'Atur filter analisis' }).click();
    await page.getByRole('combobox', { name: 'Horizon analisis', exact: true }).click();
    await page.getByRole('option', { name: 'Swing · H1 / H4 / D1', exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `expanded filters ${width}`);
    for (const pathname of ['/dashboard', '/signals', '/market', '/login']) {
      await page.goto(origin + pathname + '?theme=dark');
      await page.locator('main h1:visible').first().waitFor();
      await page.waitForTimeout(100);
      // Login also supports a dark document inherited when navigating from the workspace.
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${pathname} dark ${width}`);
      await page.screenshot({ path: path.join(out, `${pathname.slice(1)}-dark-${width}.png`), animations: 'disabled' });
    }
  }

  await page.goto(origin + '/dashboard');
  await page.locator('#workspace-content h1').waitFor();
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'Lewati ke konten' }).press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-content');
  await page.getByRole('button', { name: 'Ringkas navigasi', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navigasi utama', exact: true }).getByRole('link', { name: 'Sinyal trading', exact: true }).click();
  await page.getByRole('heading', { name: 'Sinyal trading', exact: true }).waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu navigasi' });
  await drawer.waitFor();
  assert.equal(await drawer.getByRole('link', { name: 'Robot Forex', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Buka menu navigasi' }).click();
  await drawer.getByRole('link', { name: 'Semua pasar', exact: true }).click();
  await drawer.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Semua pasar', exact: true }).waitFor();
  await page.getByLabel('Cari aset', { exact: true }).fill('zz-no-result');
  await page.getByText('Aset tidak ditemukan', { exact: true }).waitFor();
  await page.getByLabel('Cari aset', { exact: true }).fill('XAU');
  await page.getByRole('button', { name: 'Tambah XAU/USD ke pantauan', exact: true }).click();
  await page.getByRole('button', { name: 'Hapus XAU/USD dari pantauan', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/market', 'watchlist button must not navigate into the asset');
  await page.getByRole('link', { name: 'XAU/USD', exact: true }).click();
  await page.getByRole('heading', { name: 'Chart interaktif', exact: true }).waitFor();
  await page.evaluate(() => { window.fixture.assetError = true; });
  await page.getByRole('tab', { name: '4H', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Data harga atau analisis belum dapat dimuat' }).waitFor();
  await page.evaluate(() => { window.fixture.assetError = false; });
  await page.getByRole('button', { name: 'Muat ulang analisis', exact: true }).click();
  await page.getByRole('heading', { name: 'Chart interaktif', exact: true }).waitFor();
  await page.evaluate(() => { window.fixture.marketError = true; });
  await page.getByRole('link', { name: 'Kembali ke pasar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Data pasar belum dapat dimuat' }).waitFor();
  await page.evaluate(() => { window.fixture.marketError = false; });
  await page.getByRole('button', { name: 'Muat ulang pasar', exact: true }).click();
  await page.getByRole('link', { name: 'XAU/USD', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Buka pencarian cepat' }).click();
  const search = page.getByRole('combobox', { name: 'Cari aset atau fitur' });
  await search.fill('Pengaturan'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: /Pengaturan|Settings/ }).first().waitFor();
  await page.getByRole('button', { name: 'Gunakan tema gelap' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  await page.screenshot({ path: path.join(out, 'settings-dark-360.png'), animations: 'disabled' });

  // Check the core text/button palette against WCAG AA normal-text contrast.
  const contrasts = [];
  for (const theme of ['light', 'dark']) {
    const palette = await page.evaluate(theme => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      const style = getComputedStyle(document.documentElement);
      const context = document.createElement('canvas').getContext('2d');
      function luminance(name) {
        context.fillStyle = style.getPropertyValue('--' + name).trim(); context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      }
      return [['foreground', 'background'], ['card-foreground', 'card'], ['muted-foreground', 'card'], ['muted-foreground', 'background'], ['primary', 'card'], ['primary-foreground', 'primary']].map(([text, background]) => {
        const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
        return { theme, text, background, ratio: (values[0] + .05) / (values[1] + .05) };
      });
    }, theme);
    contrasts.push(...palette);
  }
  assert.deepEqual(contrasts.filter(item => item.ratio < 4.5), [], 'normal-text palette contrast >= 4.5:1');
  await writeFile(path.join(out, 'contrast-report.json'), JSON.stringify(contrasts, null, 2));

  await page.goto(origin + '/alerts');
  await page.getByRole('button', { name: 'Create Alert', exact: true }).click();
  const alertDialog = page.getByRole('dialog', { name: 'Create New Alert' });
  await alertDialog.getByLabel('Target Price', { exact: true }).fill('2500');
  assert.equal(await alertDialog.getByLabel('Asset Symbol', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press('Escape');
  await alertDialog.waitFor({ state: 'hidden' });
  await page.goto(origin + '/login');
  await page.getByLabel('Email', { exact: true }).fill('test@example.invalid');
  await page.getByLabel('Kata sandi', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Tampilkan kata sandi' }).click();
  assert.equal(await page.getByLabel('Kata sandi', { exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Email atau password tidak cocok' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, responsiveChecks: checks.length, darkViews: 16, expandedFilters: 4, palettePairs: contrasts.length, mutations: 0, viewportWidths: [360, 390, 640, 768, 900, 1024, 1280, 1440] }, null, 2));
  console.log(`PASS: ${checks.length} responsive page checks + 16 dark views; navigation, drawer, keyboard, search, watchlist, retry states, themes, contrast and login. ${out}`);
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
