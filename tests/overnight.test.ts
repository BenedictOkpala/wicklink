import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuotes } from '../lib/alpaca/quotes.ts';
import { requestReference } from '../lib/alpaca/request.ts';
import { normalizeSession, parseBitgetSession } from '../lib/market/session.ts';
import { selectReference } from '../lib/market/select.ts';
import { mergeAsset } from '../lib/market/merge.ts';
import { normalizeTicker } from '../lib/bitget/normalize.ts';
import type { ReferenceResult } from '../lib/alpaca/types.ts';

// Synthetic test fixtures only; never served by the application.
const now = Date.parse('2026-09-18T07:00:00Z');
const timestamp = new Date(now - 1000).toISOString();
const quote = { bp: 100, ap: 102, t: timestamp };
const normalize = (value: unknown) => normalizeQuotes({ quotes: { AAPL: value } }, ['AAPL'], now)[0];
const overnight: ReferenceResult = { trades: [normalize(quote)], status: 'LIVE', issue: null, feed: 'overnight' };
const iex: ReferenceResult = { trades: [{ symbol: 'AAPL', price: 100, timestamp, feed: 'iex', currency: 'USD', status: 'LIVE' }], status: 'LIVE', issue: null };
const asset = normalizeTicker({ symbol: 'AAPL', displayName: 'Apple', instrument: { symbol: 'RAAPLUSDT', baseCoin: 'rAAPL', quoteCoin: 'USDT', isReality: 'yes', status: 'online' } }, { symbol: 'RAAPLUSDT', lastPrice: '102', ts: String(now) }, now, 60000);

test('overnight quote normalization preserves both sides and single quote timestamp', () => {
  const row = normalize(quote);
  assert.equal(row.price, 101); assert.equal(row.bidPrice, 100); assert.equal(row.askPrice, 102);
  assert.equal(row.timestamp, timestamp); assert.equal(row.referenceType, 'INDICATIVE_MIDPOINT'); assert.equal(row.feed, 'overnight'); assert.equal(row.status, 'LIVE');
});
test('missing bid withholds midpoint', () => assert.equal(normalize({ ap: 102, t: timestamp }).price, null));
test('missing ask withholds midpoint', () => assert.equal(normalize({ bp: 100, t: timestamp }).price, null));
test('invalid or crossed sides cannot yield reference price', () => {
  for (const invalid of [0, -1, NaN, Infinity, '100', null]) {
    assert.equal(normalize({ ...quote, bp: invalid }).price, null);
    assert.equal(normalize({ ...quote, ap: invalid }).price, null);
  }
  assert.equal(normalize({ ...quote, bp: 103 }).price, null);
});
test('quote schema and invalid timestamps are rejected', () => {
  assert.throws(() => normalizeQuotes({}, ['AAPL'], now));
  assert.equal(normalize({ ...quote, t: 'invalid' }).status, 'UNAVAILABLE');
});
test('session normalization handles supported names only', () => {
  for (const state of ['pre_market', 'regular', 'after_hours', 'overnight', 'closed']) assert.equal(normalizeSession(state), state.toUpperCase());
  for (const state of [null, 'trading', 42, '']) assert.equal(normalizeSession(state), 'UNKNOWN');
});
test('Bitget schedules never imply active session, even with only one entry', () => {
  for (const body of [{data:{stateList:[{state:'overnight'}]}}, {data:[{stateList:[{state:'regular'}]}]}, {data:{currentState:'overnight'}}, null]) assert.equal(parseBitgetSession(body).session, 'UNKNOWN');
});
test('regular session selects IEX trade rather than overnight midpoint', () => {
  const selected = selectReference('REGULAR', iex, overnight);
  assert.equal(selected.trades[0].feed, 'iex'); assert.equal(mergeAsset(asset, selected, now).referenceType, 'TRADE');
});
test('overnight session selects indicative midpoint and calculates fresh comparison', () => {
  const row = mergeAsset({ ...asset, marketSession: 'OVERNIGHT' }, selectReference('OVERNIGHT', iex, overnight), now);
  assert.equal(row.referencePrice, 101); assert.equal(row.referenceBid, 100); assert.equal(row.referenceAsk, 102);
  assert.equal(row.referenceSource, 'Alpaca Overnight Indicative'); assert.equal(row.referenceType, 'INDICATIVE_MIDPOINT');
  assert.equal(row.comparisonStatus, 'AVAILABLE'); assert.equal(row.dislocationDirection, 'premium');
});
test('unknown, closed and unverified extended sessions withhold all comparisons', () => {
  for (const session of ['UNKNOWN', 'CLOSED', 'PRE_MARKET', 'AFTER_HOURS'] as const) {
    const row = mergeAsset(asset, selectReference(session, iex, overnight), now);
    assert.equal(row.referencePrice, null); assert.equal(row.rawDislocationPercent, null); assert.equal(row.dislocationDirection, null);
  }
});
test('stale overnight quote does not fall back to fresh IEX', () => {
  const old = { ...overnight, trades: [normalize({ ...quote, t: new Date(now - 60001).toISOString() })] };
  const row = mergeAsset(asset, selectReference('OVERNIGHT', iex, old), now);
  assert.equal(row.comparisonStatus, 'STALE'); assert.equal(row.rawDislocationPercent, null);
});
test('overnight timestamp mismatch withholds comparison', () => {
  const row = mergeAsset(asset, { ...overnight, trades: [normalize({ ...quote, t: new Date(now - 30001).toISOString() })] }, now);
  assert.equal(row.comparisonStatus, 'ASYNCHRONOUS'); assert.equal(row.rawDislocationPercent, null);
});
test('overnight transport uses documented batch endpoint and reports access codes safely', async () => {
  for (const status of [200, 403, 429, 500]) {
    const result = await requestReference({ key: 'test', secret: 'test-secret' }, async (url) => {
      const parsed = new URL(String(url)); assert.equal(parsed.pathname, '/v2/stocks/quotes/latest'); assert.equal(parsed.searchParams.get('feed'), 'overnight');
      return status === 200 ? Response.json({quotes:{AAPL:quote,NVDA:quote,TSLA:quote}}) : new Response('test-secret', {status});
    }, () => now, 'overnight');
    assert.equal(result.httpStatus, status); assert.equal(result.status, status === 200 ? 'LIVE' : 'ERROR'); assert.ok(!JSON.stringify(result).includes('test-secret'));
    if (status !== 200) assert.equal(mergeAsset(asset, selectReference('OVERNIGHT', iex, result), now).rawDislocationPercent, null);
  }
});
