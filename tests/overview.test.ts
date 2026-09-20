import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketAsset } from '../lib/bitget/types.ts';
import type { MarketSession } from '../lib/market/session.ts';
import { normalizeTicker } from '../lib/bitget/normalize.ts';
import { mergeAsset } from '../lib/market/merge.ts';
import { selectReference } from '../lib/market/select.ts';
import { ageAsset } from '../lib/market/presentation.ts';
import { buildOverviewViewModel, toOverviewAsset } from '../lib/overview/view-model.ts';
import { rankOverviewCandidates } from '../lib/overview/ranking.ts';
import type { OverviewLimit } from '../lib/overview/types.ts';

const now = Date.parse('2026-09-18T15:00:00Z');
// Synthetic canonical-state fixtures, never runtime fallbacks.
function asset(symbol = 'AAPL', percent = 0.99, patch: Partial<MarketAsset> = {}): MarketAsset {
  const instrument = { symbol: `R${symbol}USDT`, baseCoin: `R${symbol}`, quoteCoin: 'USDT', isReality: 'yes', status: 'online' };
  return {
    ...normalizeTicker({ symbol, displayName: symbol, instrument }, { symbol: instrument.symbol, lastPrice: '101', ts: String(now - 1000) }, now, 60000),
    referencePrice: 100, referenceTimestamp: new Date(now - 2000).toISOString(), referenceAgeMs: 2000,
    referenceSource: 'Alpaca IEX', referenceType: 'TRADE', referenceCurrency: 'USD',
    marketSession: 'REGULAR', referenceStatus: 'LIVE', comparisonStatus: 'AVAILABLE', dataStatus: 'LIVE',
    rawDislocationPercent: percent, dislocationDirection: percent > 0 ? 'premium' : percent < 0 ? 'discount' : 'flat',
    timestampSkewMs: 1000, comparisonAsOf: new Date(now).toISOString(), ...patch,
  };
}
function indicative(symbol = 'AAPL', percent = -0.99, session: MarketSession = 'CLOSED', patch: Partial<MarketAsset> = {}): MarketAsset {
  return asset(symbol, percent, {
    marketSession: session, comparisonStatus: 'STALE', dataStatus: 'DELAYED', referenceStatus: 'DELAYED',
    rawDislocationPercent: null, dislocationDirection: null, indicativeGapPercent: percent,
    indicativeGapDirection: percent > 0 ? 'premium' : percent < 0 ? 'discount' : 'flat', isIndicativeOnly: true,
    referenceAgeMs: 10800000, referenceTimestamp: new Date(now - 10800000).toISOString(), ...patch,
  });
}

test('Overview ranks valid live differences by absolute magnitude', () => {
  const model = buildOverviewViewModel({ assets: [asset('AAPL', 0.2), asset('NVDA', -0.99), asset('TSLA', 0.84)], marketSession: 'REGULAR' });
  assert.deepEqual(model.displayedAssets.map(a => a.symbol), ['NVDA', 'TSLA', 'AAPL']);
  assert.equal(model.selectedGroup, 'LIVE');
  assert.equal(model.counts.live, 3);
});
test('Overview ranks indicative off-hours candidates in their own group', () => {
  const model = buildOverviewViewModel({ assets: [indicative('AAPL', 0.2), indicative('NVDA', -0.99)], marketSession: 'CLOSED' });
  assert.equal(model.selectedGroup, 'INDICATIVE');
  assert.deepEqual(model.indicativeCandidates.map(a => a.symbol), ['NVDA', 'AAPL']);
  assert.equal(model.liveCandidates.length, 0);
  assert.equal(model.counts.worthWatching, 0);
});
test('fresh overnight comparisons outrank indicative gaps without filling spare slots from that group', () => {
  const live = asset('AAPL', 0.01, { marketSession: 'OVERNIGHT', referenceSource: 'Alpaca Overnight Indicative', referenceType: 'INDICATIVE_MIDPOINT', referenceBid: 99, referenceAsk: 101 });
  const model = buildOverviewViewModel({ assets: [live, indicative('NVDA', 40, 'OVERNIGHT')], marketSession: 'OVERNIGHT' });
  assert.equal(model.displayedAssets.length, 1);
  assert.equal(model.displayedAssets[0].symbol, 'AAPL');
  assert.equal(model.indicativeCandidates[0].comparison.percent, 40);
  assert.ok(model.displayedAssets[0].cautions.includes('INDICATIVE_MIDPOINT'));
  assert.equal(model.displayedAssets[0].referenceBid, 99);
});
test('positive premium and negative discount have factual unsigned context and signed numeric values', () => {
  const premium = toOverviewAsset(asset('AAPL', 0.84), 'REGULAR');
  const discount = toOverviewAsset(asset('NVDA', -0.99), 'REGULAR');
  assert.equal(premium.context, '0.84% above reference');
  assert.deepEqual(premium.comparison, { kind: 'LIVE', percent: 0.84, direction: 'premium' });
  assert.equal(discount.context, '0.99% below reference');
  assert.deepEqual(discount.comparison, { kind: 'LIVE', percent: -0.99, direction: 'discount' });
});
test('flat comparison is valid but is not called Worth Watching', () => {
  const model = buildOverviewViewModel({ assets: [asset('AAPL', 0)], marketSession: 'REGULAR' });
  assert.equal(model.displayedAssets[0].context, 'Aligned with reference');
  assert.equal(model.displayedAssets[0].comparison.direction, 'flat');
  assert.equal(model.counts.worthWatching, 0);
});
test('Worth Watching reuses the existing 0.05 percent heuristic, not a new signal', () => {
  assert.equal(toOverviewAsset(asset('AAPL', 0.049), 'REGULAR').worthWatching, false);
  assert.equal(toOverviewAsset(asset('AAPL', -0.05), 'REGULAR').worthWatching, true);
  assert.equal(toOverviewAsset(indicative('AAPL', 50), 'CLOSED').worthWatching, false);
});
test('tiny valid differences are not described as flat through rounding', () => {
  assert.equal(toOverviewAsset(asset('AAPL', 0.000001), 'REGULAR').context, '<0.0001% above reference');
});
test('indicative context contains canonical reference age without claiming official closing price', () => {
  const row = toOverviewAsset(indicative(), 'CLOSED');
  assert.equal(row.context, 'Indicative comparison · reference 3.0h old · 0.99% below reference');
  assert.ok(row.cautions.includes('INDICATIVE_COMPARISON'));
  assert.ok(row.cautions.includes('STALE_OBSERVATION'));
});
test('stale/asynchronous rows never promote raw differences to live or invent indicative values', () => {
  for (const comparisonStatus of ['STALE', 'ASYNCHRONOUS'] as const) {
    const row = toOverviewAsset(asset('AAPL', 10, { comparisonStatus, dataStatus: 'DELAYED' }), 'REGULAR');
    assert.deepEqual(row.comparison, { kind: 'WITHHELD', percent: null, direction: null });
  }
});
test('legitimate asynchronous indicative fields remain labeled and cautioned', () => {
  const row = indicative('AAPL', 1, 'OVERNIGHT', { comparisonStatus: 'ASYNCHRONOUS', referenceStatus: 'LIVE', referenceAgeMs: 50000, timestampSkewMs: 49000 });
  const model = buildOverviewViewModel({ assets: [row], marketSession: 'OVERNIGHT' });
  assert.equal(model.selectedGroup, 'INDICATIVE');
  assert.ok(model.displayedAssets[0].cautions.includes('TIMESTAMP_MISMATCH'));
});
test('regular-session stale indicative context is counted but not used as an Overview fallback', () => {
  const model = buildOverviewViewModel({ assets: [indicative('AAPL', 8, 'REGULAR')], marketSession: 'REGULAR' });
  assert.equal(model.counts.indicative, 1);
  assert.equal(model.selectedGroup, 'NONE');
  assert.deepEqual(model.displayedAssets, []);
});
test('unavailable/error comparisons with leftover numbers are withheld', () => {
  for (const status of ['UNAVAILABLE', 'ERROR'] as const) {
    const row = toOverviewAsset(asset('AAPL', 3, { comparisonStatus: status, dataStatus: status }), 'REGULAR');
    assert.equal(row.comparison.kind, 'WITHHELD');
    assert.equal(row.comparison.percent, null);
  }
});
test('UNKNOWN never becomes CLOSED and suppresses even supplied indicative context', () => {
  const model = buildOverviewViewModel({ assets: [indicative('AAPL', 5, 'UNKNOWN')], marketSession: 'UNKNOWN' });
  assert.equal(model.mode, 'UNKNOWN');
  assert.equal(model.marketSession, 'UNKNOWN');
  assert.equal(model.selectedGroup, 'NONE');
  assert.equal(model.counts.withheld, 1);
  assert.ok(model.context.includes('unknown'));
  assert.ok(toOverviewAsset(indicative('AAPL', 5, 'UNKNOWN'), 'UNKNOWN').cautions.includes('UNKNOWN_SESSION'));
});
test('all six session modes retain exact semantic identity', () => {
  for (const session of ['PRE_MARKET', 'REGULAR', 'AFTER_HOURS', 'OVERNIGHT', 'CLOSED', 'UNKNOWN'] as const) {
    const model = buildOverviewViewModel({ assets: [], marketSession: session });
    assert.equal(model.mode, session);
    assert.equal(model.marketSession, session);
  }
});
test('pre-market and after-hours accept only explicit indicative context, never an AVAILABLE live claim', () => {
  for (const session of ['PRE_MARKET', 'AFTER_HOURS', 'CLOSED'] as const) {
    assert.equal(toOverviewAsset(asset('AAPL', 1, { marketSession: session }), session).comparison.kind, 'WITHHELD');
    assert.equal(buildOverviewViewModel({ assets: [indicative('AAPL', 1, session)], marketSession: session }).selectedGroup, 'INDICATIVE');
  }
});
test('session mismatch cannot silently relabel an old observation', () => {
  const row = toOverviewAsset(asset(), 'OVERNIGHT');
  assert.equal(row.marketSession, 'REGULAR');
  assert.equal(row.comparison.kind, 'WITHHELD');
  assert.ok(row.cautions.includes('SESSION_MISMATCH'));
});
test('fewer than five candidates are not padded and the full input universe is counted', () => {
  const model = buildOverviewViewModel({ assets: [asset(), asset('NVDA', 1, { referencePrice: null })], marketSession: 'REGULAR' });
  assert.equal(model.totalMonitoredAssetCount, 2);
  assert.equal(model.displayedAssets.length, 1);
});
test('more than five candidates are capped without changing the input or universe count', () => {
  const assets = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'AMD'].map((s, i) => asset(s, i));
  const original = structuredClone(assets);
  assets.forEach(Object.freeze); Object.freeze(assets);
  const model = buildOverviewViewModel({ assets, marketSession: 'REGULAR' });
  assert.equal(model.displayedAssets.length, 5);
  assert.equal(model.totalMonitoredAssetCount, 7);
  assert.equal(model.counts.live, 7);
  assert.deepEqual(assets, original);
});
test('limits 3 and 4 work; invalid limits fail explicitly', () => {
  const assets = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'].map(s => asset(s));
  for (const limit of [3, 4] as const) assert.equal(buildOverviewViewModel({ assets, marketSession: 'REGULAR', limit }).displayedAssets.length, limit);
  assert.throws(() => buildOverviewViewModel({ assets, marketSession: 'REGULAR', limit: 6 as OverviewLimit }), RangeError);
});
test('ties use symbol then tokenized symbol and do not depend on input order', () => {
  const rows = [asset('NVDA', -1), asset('AAPL', 1), asset('TSLA', 1)].map(a => toOverviewAsset(a, 'REGULAR'));
  const sorted = rankOverviewCandidates(rows, 'LIVE').map(a => a.symbol);
  assert.deepEqual(sorted, ['AAPL', 'NVDA', 'TSLA']);
  assert.deepEqual(rankOverviewCandidates([...rows].reverse(), 'LIVE').map(a => a.symbol), sorted);
  const a = { ...rows[0], tokenizedSymbol: 'A' }, b = { ...rows[0], tokenizedSymbol: 'B' };
  assert.deepEqual(rankOverviewCandidates([b, a], 'LIVE').map(a => a.tokenizedSymbol), ['A', 'B']);
});
test('empty and no-valid-candidate inputs produce an intentional empty selection', () => {
  for (const assets of [[], [asset('AAPL', NaN)], [asset('AAPL', 2, { referenceStatus: 'ERROR' })]]) {
    const model = buildOverviewViewModel({ assets, marketSession: 'REGULAR' });
    assert.equal(model.selectedGroup, 'NONE');
    assert.deepEqual(model.displayedAssets, []);
  }
});
test('invalid percentages, direction disagreement and missing provenance are withheld', () => {
  for (const patch of [
    { rawDislocationPercent: Infinity }, { dislocationDirection: 'discount' as const },
    { referencePrice: 0 }, { tokenizedPrice: NaN }, { referenceTimestamp: 'bad' },
    { referenceAgeMs: null }, { referenceSource: null }, { referenceType: null },
  ]) assert.equal(toOverviewAsset(asset('AAPL', 1, patch), 'REGULAR').comparison.kind, 'WITHHELD');
});
test('values are copied from canonical fields, not recalculated from prices or FX fields', () => {
  const row = toOverviewAsset(asset('AAPL', 0.84, { fxNormalizedDislocationPercent: 50 }), 'REGULAR');
  assert.equal(row.tokenizedPrice, 101);
  assert.equal(row.referencePrice, 100);
  assert.equal(row.comparison.percent, 0.84);
  assert.ok(row.cautions.includes('CURRENCY_BASIS'));
  assert.ok(row.cautions.includes('SINGLE_EXCHANGE_REFERENCE'));
});
test('investigation availability follows existing supported symbols, even with insufficient data', () => {
  assert.equal(toOverviewAsset(asset('AAPL', NaN), 'REGULAR').investigationAvailable, true);
  const unsupported = toOverviewAsset(asset('OTHER'), 'REGULAR');
  assert.equal(unsupported.investigationAvailable, false);
  assert.ok(unsupported.investigationUnavailableReason);
});
test('surveillance metadata remains distinct from provider freshness and error hides cached rankings', () => {
  const input = { assets: [asset()], marketSession: 'REGULAR' as const, surveillance: { fetchedAt: new Date(now).toISOString(), snapshotAgeMs: 3000, refreshing: true, connection: 'ERROR' as const } };
  const model = buildOverviewViewModel(input);
  assert.deepEqual(model.surveillance, input.surveillance);
  assert.equal(model.totalMonitoredAssetCount, 1);
  assert.equal(model.counts.withheld, 1);
  assert.equal(model.displayedAssets.length, 0);
  assert.equal(buildOverviewViewModel({ assets: [], marketSession: 'UNKNOWN' }).surveillance.connection, 'UNKNOWN');
});
test('canonical merge and browser expiry integrate without inventing a replacement difference', () => {
  const base = asset();
  const reference = { status: 'LIVE' as const, trades: [{ symbol: 'AAPL', price: 100, timestamp: new Date(now - 2000).toISOString(), feed: 'iex' as const, currency: 'USD' as const, status: 'LIVE' as const }], issue: null };
  const merged = mergeAsset(base, reference, now);
  assert.equal(toOverviewAsset(merged, 'REGULAR').comparison.percent, 1);
  const expired = ageAsset(merged, now + 60000);
  assert.equal(toOverviewAsset(expired, 'REGULAR').comparison.kind, 'WITHHELD');
  const contextual = selectReference('CLOSED', reference, { trades: [], status: 'UNAVAILABLE', issue: null }, { allowContext: true });
  const closed = mergeAsset({ ...base, marketSession: 'CLOSED' }, contextual, now);
  assert.equal(buildOverviewViewModel({ assets: [closed], marketSession: 'CLOSED' }).selectedGroup, 'INDICATIVE');
});
