import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrades } from '../lib/alpaca/normalize.ts';
import { requestReference } from '../lib/alpaca/request.ts';

// Synthetic fixtures for tests only. No fixtures are used by runtime code.
const now = Date.parse('2026-09-18T15:00:00Z');
const timestamp = '2026-09-18T14:59:59.123456789Z';
const credentials = { key: 'test-key-not-real', secret: 'test-secret-not-real' };

test('Alpaca normalizes documented p/t fields and preserves nanosecond timestamp', () => {
  assert.deepEqual(normalizeTrades({ trades: { AAPL: { p: 100.25, t: timestamp } } }, ['AAPL'], now), [{ symbol: 'AAPL', price: 100.25, timestamp, feed: 'iex', currency: 'USD', status: 'LIVE' }]);
});
test('missing symbols are unavailable without borrowing another symbol price', () => {
  const rows = normalizeTrades({ trades: { AAPL: { p: 100, t: timestamp } } }, ['AAPL', 'NVDA'], now);
  assert.equal(rows[1].price, null); assert.equal(rows[1].timestamp, null); assert.equal(rows[1].status, 'UNAVAILABLE');
});
test('stale reference is retained and explicitly delayed', () => {
  const row = normalizeTrades({ trades: { AAPL: { p: 100, t: '2026-09-17T15:00:00Z' } } }, ['AAPL'], now)[0];
  assert.equal(row.price, 100); assert.equal(row.status, 'DELAYED');
});
test('malformed, nonpositive and nonfinite Alpaca prices are rejected', () => {
  for (const price of [0, -1, NaN, Infinity, '100', null]) {
    const row = normalizeTrades({ trades: { AAPL: { p: price, t: timestamp } } }, ['AAPL'], now)[0];
    assert.equal(row.price, null); assert.equal(row.status, 'UNAVAILABLE');
  }
});
test('invalid, missing and future timestamps cannot claim live', () => {
  for (const t of [undefined, 'bad', '2026-09-18T15:00:06Z', 123]) {
    const row = normalizeTrades({ trades: { AAPL: { p: 100, t } } }, ['AAPL'], now)[0];
    assert.equal(row.timestamp, null); assert.equal(row.status, 'UNAVAILABLE');
  }
});
test('malformed Alpaca envelope is rejected', () => {
  for (const body of [null, {}, { trades: null }]) assert.throws(() => normalizeTrades(body, ['AAPL'], now));
});
test('missing credentials do not call provider', async () => {
  let called = false;
  const fetcher: typeof fetch = async () => { called = true; throw new Error('Should not run'); };
  const result = await requestReference({ key: undefined, secret: undefined }, fetcher);
  assert.equal(called, false); assert.equal(result.status, 'UNAVAILABLE'); assert.match(result.issue!, /credentials/);
});
test('one multi-symbol IEX request uses authentication headers and explicit USD', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://data.alpaca.markets');
    assert.equal(url.pathname, '/v2/stocks/trades/latest');
    assert.equal(url.searchParams.get('symbols'), 'AAPL,NVDA,TSLA');
    assert.equal(url.searchParams.get('feed'), 'iex'); assert.equal(url.searchParams.get('currency'), 'USD');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('APCA-API-KEY-ID'), credentials.key);
    assert.equal(headers.get('APCA-API-SECRET-KEY'), credentials.secret);
    assert.equal(init?.method, 'GET'); assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal);
    return Response.json({ trades: { AAPL: { p: 100, t: timestamp }, NVDA: { p: 200, t: timestamp }, TSLA: { p: 300, t: timestamp } } });
  };
  const result = await requestReference(credentials, fetcher, () => now);
  assert.equal(calls, 1); assert.equal(result.status, 'LIVE'); assert.equal(result.trades.length, 3);
});
test('authentication, rate-limit and upstream failures do not disclose response bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    const result = await requestReference(credentials, async () => new Response('test-secret-not-real', { status }));
    assert.equal(result.status, 'ERROR'); assert.equal(result.trades.length, 0);
    assert.match(result.issue!, new RegExp(String(status))); assert.ok(!JSON.stringify(result).includes(credentials.secret));
  }
});
test('network, timeout and schema failures are safely isolated', async () => {
  for (const fetcher of [async () => { throw new Error('test-secret-not-real'); }, async () => { throw new DOMException('timeout', 'TimeoutError'); }, async () => Response.json({})]) {
    const result = await requestReference(credentials, fetcher);
    assert.equal(result.status, 'ERROR'); assert.ok(!JSON.stringify(result).includes(credentials.secret));
  }
});
test('environment variable resolution prefers APCA_API_KEY_ID with backward compatibility for APCA-API-KEY-ID', () => {
  const resolveCredentials = (env: Record<string, string | undefined>) => ({
    key: env.APCA_API_KEY_ID || env['APCA-API-KEY-ID'],
    secret: env.APCA_API_SECRET_KEY || env['APCA-API-SECRET-KEY'],
  });
  // Primary underscore keys take precedence (Vercel-compatible)
  assert.deepEqual(
    resolveCredentials({ APCA_API_KEY_ID: 'primary-key', 'APCA-API-KEY-ID': 'legacy-key', APCA_API_SECRET_KEY: 'primary-secret', 'APCA-API-SECRET-KEY': 'legacy-secret' }),
    { key: 'primary-key', secret: 'primary-secret' }
  );
  // Fallback to legacy hyphenated keys when primary is absent
  assert.deepEqual(
    resolveCredentials({ 'APCA-API-KEY-ID': 'legacy-key', 'APCA-API-SECRET-KEY': 'legacy-secret' }),
    { key: 'legacy-key', secret: 'legacy-secret' }
  );
});

