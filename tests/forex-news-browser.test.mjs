// Optional isolated UI regression, never connects to a trading service.
// PLAYWRIGHT_TEST_MODULE may point to the bundled Playwright package index.mjs.
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
const out = path.join(root, '.next', 'forex-news-ui');
const mocks = path.join(root, 'tests/fixtures/news-ui-mocks.jsx');
const compiler = webpack({ mode: 'development', devtool: false, context: root,
  entry: './tests/fixtures/news-ui-entry.jsx', output: { path: out, filename: 'fixture.js' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], alias: { '@/stores/user-store$': mocks, '@/components/layout/dashboard-layout$': mocks, 'next/link$': mocks, '@': path.join(root, 'src') } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.join(root, 'tests/fixtures/news-ui-loader.cjs') }] },
});
await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve())));
const css = await postcss([tailwind({ base: root })]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
const bundle = await readFile(path.join(out, 'fixture.js'));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="id" class="dark"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Forex News UI test</title><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
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
  await page.goto(origin); await page.getByRole('heading', { name: 'Forex News & Orders' }).waitFor();
  await page.getByRole('button', { name: 'Analisis & jadwalkan' }).first().click();
  assert.notEqual(await page.getByRole('option', { name: /Aktual di atas/ }).getAttribute('disabled'), null);
  await page.getByRole('button', { name: 'Ambil level Signals MT5' }).click();
  await page.getByText(/Skenario breakout bersyarat · XAUUSDm/).waitFor();
  assert.equal(await page.getByLabel('Entry', { exact: true }).inputValue(), '2510');
  await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Konfirmasi & jadwalkan order' }).click();
  await page.getByText('TEST response lost after save').waitFor();
  assert.equal(await page.getByLabel('Entry', { exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Periksa / ulangi dengan ID yang sama' }).click();
  await page.getByText(/Jadwal tersimpan/).waitFor();
  const posts = await page.evaluate(() => window.fixture.posts);
  assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
  assert.equal(await page.getByRole('button', { name: 'Batalkan', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Batalkan', exact: true }).click();
  await page.getByText('Dibatalkan', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Analisis & jadwalkan' }).first().click();
  await page.getByRole('button', { name: 'Ambil level Signals MT5' }).click();
  await page.getByText(/Skenario breakout bersyarat · XAUUSDm/).waitFor();
  await page.getByRole('checkbox').check();
  await page.evaluate(() => { window.fixture.failOnce = true; });
  await page.getByRole('button', { name: 'Konfirmasi & jadwalkan order' }).click();
  await page.getByText('TEST response lost after save').waitFor();
  const savedId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('forex-news-pending:fixture-owner')).request.id);
  await page.reload();
  await page.getByRole('button', { name: 'Periksa status tersimpan' }).click();
  await page.getByText(/Jadwal tersimpan/).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.orders.filter(order => order.id === JSON.parse(sessionStorage.getItem('fixture-orders')).at(-1).id).length), 1);
  assert.equal(await page.evaluate(id => window.fixture.orders.some(order => order.id === id), savedId), true);
  assert.equal(await page.evaluate(() => window.fixture.posts.length), 0, 'status recovery must not send another POST');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Analisis & jadwalkan' }).first().click();
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.screenshot({ path: path.join(out, 'mobile-light.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: isolated desktop/mobile UI, Signals levels, actual gate, lost-response retry, cancellation. Screenshots: ${out}`);
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
