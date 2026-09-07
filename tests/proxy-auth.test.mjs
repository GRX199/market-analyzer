import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

async function loadProxy({ user = null, error = null, throws = false, refreshCookie = false } = {}) {
  let authCalls = 0;
  const exports = {};
  const modules = {
    'next/server': { NextResponse },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: {
      getUser: async () => {
        authCalls += 1;
        if (refreshCookie) options.cookies.setAll([{ name: 'session-test', value: 'refreshed', options: { path: '/', httpOnly: true } }]);
        if (throws) throw new Error('network unavailable');
        return { data: { user }, error };
      },
    } }) },
  };
  const source = await readFile(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, process: { env: {} }, require: name => { assert.ok(name in modules); return modules[name]; } });
  return { proxy: exports.proxy, calls: () => authCalls };
}

test('expired API sessions return no-store JSON instead of login HTML', async () => {
  const { proxy } = await loadProxy({ refreshCookie: true });
  const response = await proxy(new NextRequest('https://test/api/trade-intelligence'));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.cookies.get('session-test').value, 'refreshed');
});

test('auth service errors and thrown network failures remain closed with retryable JSON', async () => {
  for (const options of [{ error: { name: 'AuthRetryableFetchError', status: 0 } }, { error: { name: 'AuthApiError', status: 503 } }, { throws: true }]) {
    const { proxy } = await loadProxy(options);
    const response = await proxy(new NextRequest('https://test/api/trades'));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AUTH_UNAVAILABLE');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('authenticated APIs pass through and browser redirects preserve session cookies', async () => {
  const authenticated = await loadProxy({ user: { id: 'owner' }, refreshCookie: true });
  const api = await authenticated.proxy(new NextRequest('https://test/api/trade-intelligence'));
  assert.equal(api.headers.get('x-middleware-next'), '1');
  const login = await authenticated.proxy(new NextRequest('https://test/login'));
  assert.equal(login.headers.get('location'), 'https://test/dashboard');
  assert.equal(login.cookies.get('session-test').value, 'refreshed');
  const anonymous = await loadProxy({ refreshCookie: true });
  const page = await anonymous.proxy(new NextRequest('https://test/forex-robot'));
  assert.equal(page.status, 307);
  assert.equal(page.headers.get('location'), 'https://test/login');
  assert.equal(page.cookies.get('session-test').value, 'refreshed');
});

test('worker endpoints remain independent of browser auth outages', async () => {
  const { proxy, calls } = await loadProxy({ throws: true });
  for (const [path, method] of [['/api/trades/claim', 'POST'], ['/api/trade-intelligence/ingest', 'POST'], ['/api/trading/notifications', 'POST'], ['/api/trades/id', 'PATCH']]) {
    const response = await proxy(new NextRequest(`https://test${path}`, { method }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
  }
  assert.equal(calls(), 0);
});
