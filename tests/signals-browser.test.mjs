// Optional isolated Signals UI regression. No live backend or order requests.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const out = path.join(root, 'local-reports', 'signals-ui'), mocks = path.join(root, 'tests/fixtures/news-ui-mocks.jsx');
const compiler = webpack({ mode: 'development', devtool: false, context: root,
  entry: './tests/fixtures/signals-ui-entry.jsx', output: { path: out, filename: 'fixture.js' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], alias: {
    '@/stores/user-store$': mocks, '@/components/layout/dashboard-layout$': mocks, 'next/link$': mocks,
    './legacy-scanner$': mocks, '@': path.join(root, 'src'),
  } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.join(root, 'tests/fixtures/news-ui-loader.cjs') }] },
});
await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve())));
const css = await postcss([tailwind({ base: root })]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
const bundle = await readFile(path.join(out, 'fixture.js'));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="id" class="dark"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Signals UI test</title><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const playwright = process.env.PLAYWRIGHT_TEST_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_TEST_MODULE).href) : await import('playwright');
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.getByText('Market populer lainnya', { exact: true }).click();
  await page.getByRole('region', { name: 'Akses cepat crypto' }).getByRole('button', { name: 'Sui', exact: true }).click();
  await page.getByRole('heading', { name: 'SUI/USDT', exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.fixture.requests.at(-1).symbol), 'SUI/USDT');
  assert.equal(await page.evaluate(() => window.fixture.requests.at(-1).source), 'market');
  await page.getByRole('region', { name: 'Akses cepat forex' }).getByRole('button', { name: 'NZDJPY', exact: true }).click();
  await page.getByRole('heading', { name: 'NZD/JPY', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Fokus XAUUSD', exact: true }).click();
  await page.getByRole('heading', { name: 'XAU/USD', exact: true }).first().waitFor();
  const quality = page.getByRole('region', { name: 'Kualitas pemicu entry' });
  await quality.waitFor(); await page.getByText('Entry referensi', { exact: true }).waitFor();
  await page.getByText('Breakout terkonfirmasi', { exact: true }).waitFor();
  await page.getByText('Ruang target lintas timeframe', { exact: true }).waitFor();
  const levels = page.getByRole('region', { name: 'Rencana trading manual' });
  await levels.getByRole('button', { name: 'BUY LIMIT', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kirim order', exact: true }).isDisabled(), true);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Take Profit 2 · referensi opsional', { exact: true }).fill('');
  await dialog.getByRole('region', { name: 'Evaluasi entry tiket' }).getByText('R:R TP1 sebelum biaya').waitFor();
  const confirmation = dialog.getByRole('checkbox', { name: /Saya memeriksa akun/ });
  await confirmation.check();
  assert.equal(await page.getByRole('button', { name: 'Kirim order', exact: true }).isEnabled(), true);
  await dialog.getByLabel('Volume (lot)', { exact: true }).fill('0.02');
  assert.equal(await confirmation.isChecked(), false, 'editing terms resets acknowledgement');
  await dialog.getByLabel('Volume (lot)', { exact: true }).fill('0.01');
  await confirmation.check();
  await page.evaluate(() => { window.fixture.orderMode = 'lost-response'; });
  // Dispatch a same-tick double click; a React render must not be needed for the in-flight lock.
  await page.getByRole('button', { name: 'Kirim order', exact: true }).evaluate(button => { button.click(); button.click(); });
  await dialog.getByRole('alert').filter({ hasText: 'Synthetic lost response' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.posts.length), 1);
  const originalRequest = await page.evaluate(() => window.fixture.posts[0]);
  assert.ok(originalRequest.takeProfit > 0); assert.equal('secondTarget' in originalRequest, false);
  assert.equal(await dialog.getByLabel('Entry', { exact: true }).isDisabled(), true);
  await page.evaluate(() => { window.fixture.orderMode = 'success'; });
  await page.getByRole('button', { name: 'Coba ulang ID yang sama', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Status: failed.' }).waitFor();
  const requests = await page.evaluate(() => window.fixture.posts);
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
  assert.equal(await page.getByRole('button', { name: 'Kirim order', exact: true }).isDisabled(), true);
  // A reload keeps the same ID for the exact same parameters in this browser tab.
  await page.reload();
  await page.getByRole('heading', { name: 'XAU/USD', exact: true }).first().waitFor();
  await levels.getByRole('button', { name: 'BUY LIMIT', exact: true }).click();
  await dialog.getByLabel('Take Profit 2 · referensi opsional', { exact: true }).fill('');
  await confirmation.check();
  await page.evaluate(() => { window.fixture.orderMode = 'success'; });
  await page.getByRole('button', { name: 'Kirim order', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Status: failed.' }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.posts[0].idempotencyKey), originalRequest.idempotencyKey);
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await levels.getByRole('button', { name: 'BUY LIMIT', exact: true }).click();
  await page.locator('button').filter({ hasText: /^Muat ulang$/ }).evaluate(button => button.click());
  await dialog.getByRole('alert').filter({ hasText: 'Signal telah diperbarui' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kirim order', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.evaluate(() => { window.fixture.feedKind = 'spot'; });
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await page.getByText(/0 kandidat broker · 1 kandidat spot\/referensi/).waitFor();
  await page.getByText('Kandidat lolos filter candle sumber ini. Belum diperiksa terhadap quote atau kontrak broker MT5.').waitFor();
  await page.evaluate(() => { window.fixture.feedKind = 'broker'; });
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await page.getByText(/1 kandidat broker · 0 kandidat spot\/referensi/).waitFor();
  await quality.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await quality.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'mobile.png'), animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow');
  await page.evaluate(() => { window.fixture.state = 'wait'; });
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await page.getByText('Belum terkonfirmasi', { exact: true }).waitFor();
  await page.getByText(/Breakout belum kuat/).last().waitFor();
  await page.getByText('Bersyarat · belum aktif', { exact: true }).first().waitFor();
  await page.evaluate(() => { window.fixture.state = 'stale'; });
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await page.getByText('Level kedaluwarsa disembunyikan. Muat ulang sebelum menilai entry.').waitFor();
  assert.equal(await quality.count(), 0); assert.equal(await page.getByText('Entry referensi', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.fixture.posts.length), 1, 'refresh/scenarios never submit automatically');
  assert.deepEqual(errors, []);
  console.log(`PASS: Signals desktop/mobile, entry evidence, optional TP2, edited terms, lost-response retry/reload ID, failed receipt, refreshed draft, source counts and stale guards. Mock orders only. Screenshots: ${out}`);
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
