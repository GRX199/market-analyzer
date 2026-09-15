// Explicit opt-in, isolated local PostgreSQL test. Requires the fixture above
// in a DISPOSABLE database named forex_news_test on loopback port 55487.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const psql = process.env.PSQL_TEST_BINARY || 'psql';
function sql(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-h', '127.0.0.1', '-p', '55487', '-U', 'news_test', '-d', 'forex_news_test', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', command], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  });
}
const service = "SET request.jwt.claim.role='service_role'; ";
const transition = (n, state) => `SELECT status FROM transition_forex_news_order('${id(n)}','${owner}','${state}','fixture',100,repeat('a',24));`;
await sql(`SELECT news_test_schedule('${id(1)}');`);
const results = await Promise.all([sql(service + transition(1, 'queued')), sql(service + transition(1, 'queued'))]);
assert.deepEqual(results, ['queued', 'queued']);
assert.equal(await sql(`SELECT count(*) FROM auto_trades WHERE idempotency_key='news:${id(1)}';`), '1');
assert.equal(await sql(service + transition(1, 'cancelled')), 'queued');
assert.equal(await sql(service + `SELECT count(*) FROM transition_forex_news_order('${id(1)}','${other}','cancelled');`), '0');

await sql(`SELECT news_test_schedule('${id(2)}');`);
await Promise.all([sql(service + transition(2, 'cancelled')), sql(service + transition(2, 'queued'))]);
const raceStatus = await sql(`SELECT status FROM forex_news_orders WHERE id='${id(2)}';`);
assert.ok(['queued', 'cancelled'].includes(raceStatus));
assert.equal(await sql(`SELECT count(*) FROM auto_trades WHERE idempotency_key='news:${id(2)}';`), raceStatus === 'queued' ? '1' : '0');

await sql(`SELECT news_test_schedule('${id(3)}',-1);`);
assert.equal(await sql(service + transition(3, 'queued')), 'expired');
await assert.rejects(sql(transition(3, 'queued')), /service role required/);
await assert.rejects(sql(`SET ROLE authenticated; ${transition(3, 'queued')}`), /permission denied/);
assert.equal(await sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}'; SELECT count(*) FROM forex_news_orders;`), '0');
assert.equal(await sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}'; SELECT count(*) FROM forex_news_orders;`), '3');
await assert.rejects(sql(`SET ROLE authenticated; UPDATE forex_news_orders SET status='queued';`), /permission denied/);

// Legacy workers cannot claim news. Only updated workers on the bound account.
assert.equal(await sql(service + `SELECT count(*) FROM claim_auto_trades('legacy-worker','${owner}',1,'demo');`), '0');
assert.equal(await sql(service + `SELECT count(*) FROM claim_auto_trades('other-account','${owner}',1,'demo',repeat('b',24));`), '0');
assert.equal(await sql(service + `SELECT count(*) FROM claim_auto_trades('real-worker','${owner}',1,'real',repeat('a',24));`), '0');
assert.equal(await sql(service + `SELECT count(*) FROM claim_auto_trades('updated-worker','${owner}',1,'demo',repeat('a',24));`), '1');
assert.equal(await sql("SELECT bool_and(abs(extract(epoch from clock_timestamp()-claimed_at)) < 10) FROM auto_trades WHERE status='processing';"), 't');
assert.equal(await sql(service + `SELECT count(*) FROM claim_auto_trades('second-worker','${owner}',1,'demo',repeat('a',24));`), '0');

// Force the dispatch function to wait on a row lock past the submission window.
await sql(`SELECT news_test_schedule('${id(4)}',1);`);
const locker = sql(`BEGIN; SELECT id FROM forex_news_orders WHERE id='${id(4)}' FOR UPDATE; SELECT pg_sleep(2); COMMIT;`);
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(await sql(service + transition(4, 'queued')), 'expired'); await locker;
assert.equal(await sql(`SELECT count(*) FROM auto_trades WHERE idempotency_key='news:${id(4)}';`), '0');
console.log('PASS: SQL migration replay, atomic dispatch/cancel, RLS, account capability, single claim and expiry after row-lock wait.');
