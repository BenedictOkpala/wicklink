import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicker } from '../lib/bitget/normalize.ts';
import { mergeAsset, mergeMarket } from '../lib/market/merge.ts';
import { referenceSymbol } from '../lib/market/symbols.ts';
import { ageAsset } from '../lib/market/presentation.ts';
import { calculateDislocation } from '../lib/dislocation/calculate.ts';
import type { ReferenceResult } from '../lib/alpaca/types.ts';
import type { MarketResponse } from '../lib/bitget/types.ts';

// Synthetic unit-test fixtures, never application fallback data.
const now = Date.parse('2026-09-18T15:00:00Z');
const instrument = { symbol: 'RAAPLUSDT', baseCoin: 'rAAPL', quoteCoin: 'USDT', isReality: 'yes', status: 'online' };
const asset = normalizeTicker({ symbol: 'AAPL', displayName: 'Apple Inc.', instrument }, { symbol: instrument.symbol, lastPrice: '101', ts: String(now - 1000) }, now, 60000);
const reference: ReferenceResult = { status: 'LIVE', issue: null, trades: [{ symbol: 'AAPL', price: 100, timestamp: new Date(now - 2000).toISOString(), feed: 'iex', currency: 'USD', status: 'LIVE' }] };
const market: MarketResponse = { assets: [asset], fetchedAt: new Date(now).toISOString(), dataStatus: 'LIVE', referenceAvailable: false, message: '', events: [] };

test('exact Bitget to Alpaca mapping', () => {
  assert.equal(referenceSymbol('RAAPLUSDT'), 'AAPL'); assert.equal(referenceSymbol('RNVDAUSDT'), 'NVDA'); assert.equal(referenceSymbol('RTSLAUSDT'), 'TSLA');
  assert.equal(referenceSymbol('AAPLUSDT'), null); assert.equal(referenceSymbol('BTCUSDT'), null); assert.equal(referenceSymbol('toString'), null);
});
test('successful cross-market merge integrates deterministic calculator', () => {
  const row = mergeAsset(asset, reference, now);
  const expected = calculateDislocation(100, 101);
  assert.equal(row.referencePrice, 100); assert.equal(row.rawDislocationPercent, expected.percentageDifference);
  assert.equal(row.absoluteDifference, expected.absoluteDifference); assert.equal(row.priceDifference, 1);
  assert.equal(row.dislocationDirection, expected.direction); assert.equal(row.comparisonStatus, 'AVAILABLE');
  assert.equal(row.referenceSource, 'Alpaca IEX'); assert.equal(row.referenceCurrency, 'USD');
  assert.equal(row.tokenizedAgeMs, 1000); assert.equal(row.referenceAgeMs, 2000); assert.equal(row.timestampSkewMs, 1000);
});
test('discount and flat integration preserve direction and signed delta', () => {
  const discount = mergeAsset({ ...asset, tokenizedPrice: 99 }, reference, now);
  assert.equal(discount.dislocationDirection, 'discount'); assert.equal(discount.rawDislocationPercent, -1); assert.equal(discount.priceDifference, -1); assert.equal(discount.absoluteDifference, 1);
  const flat = mergeAsset({ ...asset, tokenizedPrice: 100 }, reference, now);
  assert.equal(flat.dislocationDirection, 'flat'); assert.equal(flat.rawDislocationPercent, 0);
});
test('missing Alpaca data preserves live Bitget quote', () => {
  const row = mergeAsset(asset, { trades: [], status: 'UNAVAILABLE', issue: 'Underlying reference unavailable' }, now);
  assert.equal(row.tokenizedPrice, 101); assert.equal(row.bitgetStatus, 'LIVE'); assert.equal(row.referencePrice, null); assert.equal(row.rawDislocationPercent, null); assert.equal(row.dataStatus, 'UNAVAILABLE');
});
test('stale reference suppresses all difference fields but retains observed price', () => {
  const row = mergeAsset(asset, { ...reference, trades: [{ ...reference.trades[0], timestamp: new Date(now - 60001).toISOString() }] }, now);
  assert.equal(row.referencePrice, 100); assert.equal(row.referenceStatus, 'DELAYED'); assert.equal(row.comparisonStatus, 'STALE');
  assert.equal(row.rawDislocationPercent, null); assert.equal(row.absoluteDifference, null); assert.equal(row.priceDifference, null); assert.equal(row.dislocationDirection, null);
});
test('stale Bitget timestamp is rechecked even when cached status was LIVE', () => {
  const row = mergeAsset({ ...asset, tokenizedTimestamp: new Date(now - 60001).toISOString() }, reference, now);
  assert.equal(row.bitgetStatus, 'DELAYED'); assert.equal(row.rawDislocationPercent, null); assert.equal(row.comparisonStatus, 'STALE');
});
test('fresh but widely separated observations are not compared', () => {
  const row = mergeAsset(asset, { ...reference, trades: [{ ...reference.trades[0], timestamp: new Date(now - 40000).toISOString() }] }, now);
  assert.equal(row.comparisonStatus, 'ASYNCHRONOUS'); assert.equal(row.rawDislocationPercent, null); assert.equal(row.timestampSkewMs, 39000);
});
test('freshness boundary is inclusive and expires immediately afterward', () => {
  const aligned = { ...asset, tokenizedTimestamp: new Date(now - 60000).toISOString() };
  const oldReference = { ...reference, trades: [{ ...reference.trades[0], timestamp: aligned.tokenizedTimestamp }] };
  assert.equal(mergeAsset(aligned, oldReference, now).comparisonStatus, 'AVAILABLE');
  assert.equal(mergeAsset(aligned, oldReference, now + 1).comparisonStatus, 'STALE');
});
test('Alpaca failure leaves Bitget independent', () => {
  const merged = mergeMarket(market, { trades: [], status: 'ERROR', issue: 'Alpaca failed' }, now);
  assert.equal(merged.assets[0].tokenizedPrice, 101); assert.equal(merged.assets[0].bitgetStatus, 'LIVE'); assert.equal(merged.assets[0].referencePrice, null); assert.equal(merged.assets[0].comparisonStatus, 'ERROR');
});
test('Bitget ticker failure retains reference without fabricating tokenized price', () => {
  const row = mergeAsset({ ...asset, tokenizedPrice: null, tokenizedTimestamp: null, dataStatus: 'ERROR', issue: 'Bitget failed' }, reference, now);
  assert.equal(row.tokenizedPrice, null); assert.equal(row.referencePrice, 100); assert.equal(row.rawDislocationPercent, null); assert.equal(row.bitgetStatus, 'ERROR');
});
test('discovery failure does not fabricate registry rows', () => {
  const merged = mergeMarket({ ...market, assets: [], dataStatus: 'ERROR' }, reference, now);
  assert.deepEqual(merged.assets, []); assert.equal(merged.dataStatus, 'ERROR');
});
test('mismatched symbol is never merged', () => {
  const row = mergeAsset({ ...asset, tokenizedSymbol: 'RNVDAUSDT' }, reference, now);
  assert.equal(row.referencePrice, null); assert.equal(row.rawDislocationPercent, null);
});
test('browser freshness projection removes comparison between network polls', () => {
  const row = mergeAsset(asset, reference, now);
  const later = ageAsset(row, now + 60000);
  assert.equal(later.comparisonStatus, 'STALE'); assert.equal(later.rawDislocationPercent, null); assert.equal(later.tokenizedPrice, 101); assert.equal(later.referencePrice, 100);
});

test('stale reference populates indicative gap for context without active dislocation', () => {
  const staleRef: ReferenceResult = { ...reference, trades: [{ ...reference.trades[0], status: 'DELAYED', timestamp: new Date(now - 120000).toISOString() }] };
  const row = mergeAsset(asset, staleRef, now);
  assert.equal(row.comparisonStatus, 'STALE');
  assert.equal(row.rawDislocationPercent, null);
  assert.equal(row.isIndicativeOnly, true);
  assert.equal(row.indicativeGapPercent, 1);
  assert.equal(row.indicativeGapDirection, 'premium');
  assert.equal(row.referencePrice, 100);
  assert.equal(row.tokenizedPrice, 101);
});

test('FX rate normalization computes normalized tokenized price and gap', () => {
  const fxRate = { pair: 'USDT/USD' as const, rate: 0.9990, timestamp: new Date(now).toISOString(), ageMs: 1000, status: 'LIVE' as const, source: 'Bitget Spot USDTUSD', parityDeltaPercent: -0.1 };
  const row = mergeAsset(asset, reference, now, fxRate);
  assert.equal(row.comparisonStatus, 'AVAILABLE');
  assert.equal(row.rawDislocationPercent, 1);
  assert.equal(row.fxNormalizedTokenizedPrice, 100.899);
  assert.equal(row.fxNormalizedDislocationPercent, 0.899);
});

test('Active Dislocations KPI filter strictly ignores stale indicative gaps', () => {
  const staleRef: ReferenceResult = { ...reference, trades: [{ ...reference.trades[0], status: 'DELAYED', timestamp: new Date(now - 120000).toISOString() }] };
  const staleAsset = mergeAsset(asset, staleRef, now);
  const freshAsset = mergeAsset(asset, reference, now);

  const assets = [staleAsset, freshAsset];
  const activeDislocations = assets.filter(
    a => a.comparisonStatus === 'AVAILABLE' && a.rawDislocationPercent !== null && Math.abs(a.rawDislocationPercent) >= 0.05
  ).length;

  assert.equal(activeDislocations, 1);
  assert.equal(staleAsset.comparisonStatus, 'STALE');
  assert.equal(staleAsset.rawDislocationPercent, null);
  assert.ok(staleAsset.indicativeGapPercent !== null);
});

