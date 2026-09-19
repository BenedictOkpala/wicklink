import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSession, SESSION_SOURCE } from '../lib/market/resolve-session.ts';
import { selectReference } from '../lib/market/select.ts';
import { mergeAsset } from '../lib/market/merge.ts';
import { normalizeTicker } from '../lib/bitget/normalize.ts';
import type { ReferenceResult } from '../lib/alpaca/types.ts';

// Synthetic provider-shaped fixtures. Every evaluation uses a fixed UTC timestamp.
function states(daylightType = 'dst', zone = 'ET') {
  return { code: '00000', data: { market: 'US', daylightType, stateList: [
    { state: 'pre_market', timeZone: zone, startTime: '04:00', endTime: '09:30' },
    { state: 'regular', timeZone: zone, startTime: '09:30', endTime: '16:00' },
    { state: 'after_hours', timeZone: zone, startTime: '16:00', endTime: '20:00' },
    { state: 'overnight', timeZone: zone, startTime: '20:00', endTime: '04:00' },
  ] } };
}
function calendar(ranges: { startTime: string; endTime: string; remark?: string }[] = [], zone = 'ET', weekends = ['SATURDAY', 'SUNDAY']) {
  return { code: '00000', data: { timeZone: zone, regularConfig: weekends, specificConfig: ranges } };
}
const resolve = (utc: string, schedule: unknown = states(), cal: unknown = calendar()) => resolveSession(schedule, cal, Date.parse(utc));

const phases = [
  ['pre-market', '2026-09-16T09:00:00Z', 'PRE_MARKET'],
  ['regular', '2026-09-16T15:00:00Z', 'REGULAR'],
  ['after-hours', '2026-09-16T21:00:00Z', 'AFTER_HOURS'],
  ['overnight before midnight', '2026-09-17T01:00:00Z', 'OVERNIGHT'],
  ['overnight after midnight', '2026-09-17T06:00:00Z', 'OVERNIGHT'],
] as const;
for (const [name, time, expected] of phases) test(`session: ${name}`, () => assert.equal(resolve(time).session, expected));

for (const [time, expected] of [
  ['2026-09-16T07:59:59.999Z', 'OVERNIGHT'], ['2026-09-16T08:00:00Z', 'PRE_MARKET'],
  ['2026-09-16T13:29:59.999Z', 'PRE_MARKET'], ['2026-09-16T13:30:00Z', 'REGULAR'],
  ['2026-09-16T19:59:59.999Z', 'REGULAR'], ['2026-09-16T20:00:00Z', 'AFTER_HOURS'],
  ['2026-09-16T23:59:59.999Z', 'AFTER_HOURS'], ['2026-09-17T00:00:00Z', 'OVERNIGHT'],
] as const) test(`session boundary ${time}`, () => assert.equal(resolve(time).session, expected));

test('weekend closures override regular clock hours', () => {
  assert.equal(resolve('2026-09-19T15:00:00Z').session, 'CLOSED');
  assert.equal(resolve('2026-09-20T15:00:00Z').session, 'CLOSED');
});
test('midnight-spanning weekend edges conservatively close', () => {
  assert.equal(resolve('2026-09-19T01:00:00Z').session, 'CLOSED'); // Friday night touches Saturday.
  assert.equal(resolve('2026-09-21T06:00:00Z').session, 'CLOSED'); // Monday morning started Sunday.
  assert.equal(resolve('2026-09-21T08:00:00Z').session, 'PRE_MARKET');
});
test('holiday closes clock-regular session', () => {
  const cal = calendar([{ startTime: '2026-09-06 20:00', endTime: '2026-09-07 20:00' }]);
  assert.equal(resolve('2026-09-07T15:00:00Z', states(), cal).session, 'CLOSED');
});
test('special partial closure overrides regular schedule with half-open boundaries', () => {
  const cal = calendar([{ startTime: '2026-09-16 12:00', endTime: '2026-09-16 13:00', remark: 'Special closure fixture' }]);
  assert.equal(resolve('2026-09-16T15:59:59.999Z', states(), cal).session, 'REGULAR');
  assert.equal(resolve('2026-09-16T16:00:00Z', states(), cal).session, 'CLOSED');
  assert.equal(resolve('2026-09-16T17:00:00Z', states(), cal).session, 'REGULAR');
});
test('holiday closure crossing midnight blocks overnight', () => {
  const cal = calendar([{ startTime: '2026-09-16 20:00', endTime: '2026-09-17 20:00' }]);
  assert.equal(resolve('2026-09-17T01:00:00Z', states(), cal).session, 'CLOSED');
  assert.equal(resolve('2026-09-17T06:00:00Z', states(), cal).session, 'CLOSED');
});
test('standard time uses IANA winter timezone conversion', () => {
  const row = resolve('2026-01-14T14:30:00Z', states('standard', 'EST'), calendar([], 'EST'));
  assert.equal(row.session, 'REGULAR'); assert.equal(row.localTime, '2026-01-14T09:30:00'); assert.equal(row.resolvedDaylightType, 'standard');
});
test('daylight time shifts regular open without a fixed offset', () => {
  const row = resolve('2026-07-15T13:30:00Z', states('dst', 'EDT'));
  assert.equal(row.session, 'REGULAR'); assert.equal(row.localTime, '2026-07-15T09:30:00'); assert.equal(row.resolvedDaylightType, 'dst');
});
test('spring-forward gap is resolved from UTC, not nonexistent local times', () => {
  const cal = calendar([], 'ET', []);
  const before = resolve('2026-03-08T06:59:59Z', states('standard'), cal);
  const after = resolve('2026-03-08T07:00:00Z', states('dst'), cal);
  assert.equal(before.session, 'OVERNIGHT'); assert.equal(before.localTime, '2026-03-08T01:59:59');
  assert.equal(after.session, 'OVERNIGHT'); assert.equal(after.localTime, '2026-03-08T03:00:00');
});
test('fall-back repeated hour respects supplied UTC instant', () => {
  const cal = calendar([], 'ET', []);
  const first = resolve('2026-11-01T05:30:00Z', states('dst'), cal);
  const second = resolve('2026-11-01T06:30:00Z', states('standard'), cal);
  assert.equal(first.session, 'OVERNIGHT'); assert.equal(second.session, 'OVERNIGHT');
  assert.equal(first.localTime, second.localTime); assert.notEqual(first.resolvedDaylightType, second.resolvedDaylightType);
});
test('live-shaped standard metadata on a DST date remains resolvable with diagnostic', () => {
  const row = resolve('2026-09-18T08:11:00Z', states('standard', 'EST'), calendar([], 'EST'));
  assert.equal(row.session, 'PRE_MARKET'); assert.equal(row.issue, null); assert.match(row.timezoneDiagnostic!, /reports standard.*resolves to dst/);
  assert.equal(row.reportedDaylightType, 'standard'); assert.equal(row.resolvedDaylightType, 'dst');
});
test('EST schedule label cannot silently override DST rules', () => {
  const row = resolve('2026-09-16T15:00:00Z', states('dst', 'EST'));
  assert.equal(row.session, 'REGULAR'); assert.match(row.timezoneDiagnostic!, /schedule labels EST/);
});
test('EST calendar is ambiguous near DST closure edges', () => {
  const cal = calendar([{ startTime: '2026-07-06 10:00', endTime: '2026-07-06 12:00' }], 'EST');
  assert.equal(resolve('2026-07-06T14:30:00Z', states(), cal).session, 'UNKNOWN');
  assert.equal(resolve('2026-07-06T15:30:00Z', states(), cal).session, 'CLOSED');
  assert.equal(resolve('2026-07-06T16:30:00Z', states(), cal).session, 'UNKNOWN');
  assert.equal(resolve('2026-07-06T17:00:00Z', states(), cal).session, 'REGULAR');
});
test('confirmed calendar closure remains CLOSED despite conflicting daylight metadata', () => {
  assert.equal(resolve('2026-09-19T15:00:00Z', states('standard', 'EST'), calendar([], 'EST')).session, 'CLOSED');
});
test('supports documented schedule array and actual schedule object', () => {
  assert.equal(resolve('2026-09-16T15:00:00Z', { code: '00000', data: [states().data] }).session, 'REGULAR');
});
test('duplicate US markets cannot resolve a session', () => assert.equal(resolve('2026-09-16T15:00:00Z', { code: '00000', data: [states().data, states().data] }).session, 'UNKNOWN'));
test('missing calendar never implies open', () => {
  for (const cal of [null, {}, { code: '00000', data: {} }, { code: 'ERROR', data: calendar().data }]) assert.equal(resolve('2026-09-16T15:00:00Z', states(), cal).session, 'UNKNOWN');
});
test('malformed schedule and unknown state fail closed to UNKNOWN', () => {
  for (const edit of [(s: ReturnType<typeof states>) => { s.data.stateList.pop(); },
    (s: ReturnType<typeof states>) => { s.data.stateList[1].state = 'unrecognized'; },
    (s: ReturnType<typeof states>) => { s.data.stateList[1].startTime = '25:00'; },
    (s: ReturnType<typeof states>) => { s.data.stateList[1].startTime = '9:30'; },
    (s: ReturnType<typeof states>) => { s.data.stateList[1].timeZone = 'UTC'; }]) {
    const data = states(); edit(data); assert.equal(resolve('2026-09-16T15:00:00Z', data).session, 'UNKNOWN');
  }
});
test('overlaps, gaps, duplicate states and empty spans are rejected', () => {
  for (const start of ['09:00', '10:00', '16:00']) {
    const s = states(); s.data.stateList[1].startTime = start; assert.equal(resolve('2026-09-16T15:00:00Z', s).session, 'UNKNOWN');
  }
  const s = states(); s.data.stateList[1].state = 'pre_market'; assert.equal(resolve('2026-09-16T15:00:00Z', s).session, 'UNKNOWN');
});
test('invalid calendar date, reversed closure and unknown weekday rejected', () => {
  for (const range of [{startTime:'2026-02-30 00:00',endTime:'2026-03-01 00:00'}, {startTime:'2026-09-17 20:00',endTime:'2026-09-16 20:00'}]) assert.equal(resolve('2026-09-16T15:00:00Z', states(), calendar([range])).session, 'UNKNOWN');
  assert.equal(resolve('2026-09-16T15:00:00Z', states(), calendar([], 'ET', ['FUNDAY'])).session, 'UNKNOWN');
});
test('invalid injected timestamp produces UNKNOWN without throwing', () => {
  for (const now of [NaN, Infinity, -1, 1e20]) assert.equal(resolveSession(states(), calendar(), now).session, 'UNKNOWN');
});
test('host timezone does not affect resolution', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo'; const first = resolve('2026-09-16T15:00:00Z');
    process.env.TZ = 'Pacific/Honolulu'; const second = resolve('2026-09-16T15:00:00Z');
    assert.deepEqual(first, second); assert.equal(first.session, 'REGULAR'); assert.equal(first.sessionSource, SESSION_SOURCE);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('cached input re-evaluation observes regular-to-after-hours transition', () => {
  const s = states(), c = calendar();
  assert.equal(resolve('2026-09-16T19:59:59Z', s, c).session, 'REGULAR');
  assert.equal(resolve('2026-09-16T20:00:00Z', s, c).session, 'AFTER_HOURS');
});

for (const [name, utc, expected] of phases) test(`session/reference integration: ${name}`, () => {
  const now = Date.parse(utc), timestamp = new Date(now - 1000).toISOString();
  const session = resolve(utc);
  const iex: ReferenceResult = { trades: [{ symbol: 'AAPL', price: 100, timestamp, feed: 'iex', currency: 'USD', status: 'LIVE' }], status: 'LIVE', issue: null };
  const overnight: ReferenceResult = { ...iex, trades: [{ ...iex.trades[0], feed: 'overnight', bidPrice: 99, askPrice: 101, referenceType: 'INDICATIVE_MIDPOINT' }] };
  const asset = normalizeTicker({ symbol: 'AAPL', displayName: 'Apple', instrument: { symbol:'RAAPLUSDT',baseCoin:'rAAPL',quoteCoin:'USDT',status:'online',isReality:'yes' } }, { symbol:'RAAPLUSDT',lastPrice:'101',ts:String(now) }, now, 60000);
  const selected = selectReference(session.session, iex, overnight);
  const merged = mergeAsset({ ...asset, marketSession: session.session, sessionSource: session.sessionSource }, selected, now);
  if (expected === 'REGULAR' || expected === 'OVERNIGHT') {
    assert.equal(merged.comparisonStatus, 'AVAILABLE'); assert.equal(merged.rawDislocationPercent, 1);
    assert.equal(merged.referenceType, expected === 'REGULAR' ? 'TRADE' : 'INDICATIVE_MIDPOINT');
  } else { assert.equal(merged.referencePrice, null); assert.equal(merged.rawDislocationPercent, null); }
});

test('winter IANA standard time wins over conflicting provider DST metadata', () => {
  const row = resolve('2026-01-14T14:30:00Z', states('dst', 'EDT'), calendar([], 'EST'));
  assert.equal(row.session, 'REGULAR'); assert.equal(row.localTime, '2026-01-14T09:30:00');
  assert.equal(row.resolvedDaylightType, 'standard'); assert.match(row.timezoneDiagnostic!, /reports dst.*resolves to standard/);
});
test('aligned metadata produces no timezone warning', () => {
  assert.equal(resolve('2026-09-16T15:00:00Z').timezoneDiagnostic, null);
  assert.equal(resolve('2026-01-14T15:00:00Z', states('standard', 'EST'), calendar([], 'EST')).timezoneDiagnostic, null);
});
test('unrecognized provider daylight metadata remains diagnostic-only', () => {
  const row = resolve('2026-09-16T15:00:00Z', states('unrecognized'));
  assert.equal(row.session, 'REGULAR'); assert.equal(row.reportedDaylightType, 'unrecognized');
  assert.match(row.timezoneDiagnostic!, /unrecognized/);
});
test('spring transition resolves with stale standard metadata without fixed offset', () => {
  const cal = calendar([], 'ET', []);
  const before = resolve('2026-03-08T06:59:59Z', states('standard', 'EST'), cal);
  const after = resolve('2026-03-08T07:00:00Z', states('standard', 'EST'), cal);
  assert.equal(before.localTime, '2026-03-08T01:59:59'); assert.equal(before.timezoneDiagnostic, null);
  assert.equal(after.localTime, '2026-03-08T03:00:00'); assert.equal(after.session, 'OVERNIGHT'); assert.match(after.timezoneDiagnostic!, /resolves to dst/);
});
test('fall transition resolves with stale DST metadata', () => {
  const cal = calendar([], 'ET', []);
  const row = resolve('2026-11-01T06:00:00Z', states('dst', 'EDT'), cal);
  assert.equal(row.localTime, '2026-11-01T01:00:00'); assert.equal(row.session, 'OVERNIGHT'); assert.match(row.timezoneDiagnostic!, /resolves to standard/);
});
test('overnight portions share start/end dates while calendar date follows local midnight', () => {
  const before = resolve('2026-09-17T01:00:00Z', states('standard', 'EST'));
  const after = resolve('2026-09-17T06:00:00Z', states('standard', 'EST'));
  assert.equal(before.session, 'OVERNIGHT'); assert.equal(after.session, 'OVERNIGHT');
  assert.equal(before.calendarDate, '2026-09-16'); assert.equal(after.calendarDate, '2026-09-17');
  for (const row of [before, after]) { assert.equal(row.sessionStartDate, '2026-09-16'); assert.equal(row.sessionEndDate, '2026-09-17'); }
});
test('post-midnight holiday on current calendar date overrides overnight despite diagnostic', () => {
  const cal = calendar([{ startTime:'2026-09-17 00:00',endTime:'2026-09-18 00:00' }]);
  const row = resolve('2026-09-17T06:00:00Z', states('standard', 'EST'), cal);
  assert.equal(row.session, 'CLOSED'); assert.equal(row.calendarDate, '2026-09-17'); assert.ok(row.timezoneDiagnostic);
});
test('closed weekday stays closed with conflicting metadata', () => {
  const row = resolve('2026-09-19T15:00:00Z', states('standard', 'EST'));
  assert.equal(row.session, 'CLOSED'); assert.match(row.timezoneDiagnostic!, /reports standard/);
});
test('timezone warning does not bypass missing calendar or malformed schedule', () => {
  const missing = resolve('2026-09-16T15:00:00Z', states('standard', 'EST'), null);
  assert.equal(missing.session, 'UNKNOWN'); assert.match(missing.issue!, /calendar/); assert.ok(missing.timezoneDiagnostic);
  const malformed = states('standard', 'EST'); malformed.data.stateList[1].startTime = 'bad';
  assert.equal(resolve('2026-09-16T15:00:00Z', malformed).session, 'UNKNOWN');
});
test('returned Bitget boundaries remain authoritative despite timezone diagnostic', () => {
  const schedule = states('standard', 'EST');
  schedule.data.stateList[0].endTime = '10:00'; schedule.data.stateList[1].startTime = '10:00';
  assert.equal(resolve('2026-09-16T13:45:00Z', schedule).session, 'PRE_MARKET');
  assert.equal(resolve('2026-09-16T14:00:00Z', schedule).session, 'REGULAR');
});
test('regular resolution despite daylight conflict activates IEX with freshness enforcement', () => {
  const now = Date.parse('2026-09-16T15:00:00Z');
  const session = resolve('2026-09-16T15:00:00Z', states('standard', 'EST'), calendar([], 'EST'));
  assert.equal(session.session, 'REGULAR'); assert.ok(session.timezoneDiagnostic);
  const fresh: ReferenceResult = { trades: [{symbol:'AAPL',price:100,timestamp:new Date(now - 1000).toISOString(),feed:'iex',currency:'USD',status:'LIVE'}],status:'LIVE',issue:null };
  const empty: ReferenceResult = { trades: [], status:'UNAVAILABLE',issue:null };
  const asset = normalizeTicker({symbol:'AAPL',displayName:'Apple',instrument:{symbol:'RAAPLUSDT',baseCoin:'rAAPL',quoteCoin:'USDT',status:'online',isReality:'yes'}},{symbol:'RAAPLUSDT',lastPrice:'101',ts:String(now)},now,60000);
  const reference = selectReference(session.session, fresh, empty);
  assert.equal(reference.feed, 'iex');
  const row = mergeAsset({...asset,marketSession:session.session},reference,now);
  assert.equal(row.rawDislocationPercent, 1); assert.equal(row.comparisonStatus, 'AVAILABLE');
  const stale = {...fresh,trades:[{...fresh.trades[0],timestamp:new Date(now-60001).toISOString()}]};
  assert.equal(mergeAsset(asset,selectReference(session.session,stale,empty),now).rawDislocationPercent,null);
});
