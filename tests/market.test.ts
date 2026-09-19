import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSymbols } from '../lib/bitget/symbols.ts';
import { normalizeTicker, parseInstruments, parseTicker } from '../lib/bitget/normalize.ts';
// Synthetic test fixtures only. Never served by the application.
const instrument = {symbol:'RAAPLUSDT',baseCoin:'rAAPL',quoteCoin:'USDT',isReality:'yes',status:'online'};
const asset = {symbol:'AAPL',displayName:'Apple Inc.',instrument};
const now = 1789715400000;
test('registry requires confirmed Reality instruments', () => { assert.equal(discoverSymbols([]).length,0); assert.equal(discoverSymbols([{...instrument,isReality:'no'}]).length,0); assert.equal(discoverSymbols([instrument])[0].instrument.symbol,'RAAPLUSDT'); });
test('normalizes real schema and leaves reference fields null', () => { const row = normalizeTicker(asset,{symbol:instrument.symbol,lastPrice:'200.12',ts:String(now)},now,60000); assert.equal(row.tokenizedPrice,200.12); assert.equal(row.dataStatus,'LIVE'); assert.equal(row.referencePrice,null); assert.equal(row.rawDislocationPercent,null); });
test('stale ticker is delayed', () => assert.equal(normalizeTicker(asset,{symbol:instrument.symbol,lastPrice:'200',ts:String(now-60001)},now,60000).dataStatus,'DELAYED'));
test('invalid timestamps and prices are unavailable', () => { for (const ticker of [null,{symbol:instrument.symbol,lastPrice:'0',ts:String(now)},{symbol:instrument.symbol,lastPrice:'200',ts:'bad'},{symbol:instrument.symbol,lastPrice:'200',ts:String(now+60000)}]) assert.equal(normalizeTicker(asset,ticker,now,60000).dataStatus,'UNAVAILABLE'); });
test('offline instrument never claims live', () => assert.equal(normalizeTicker({...asset,instrument:{...instrument,status:'offline'}},{symbol:instrument.symbol,lastPrice:'200',ts:String(now)},now,60000).dataStatus,'UNAVAILABLE'));
test('schema validation rejects malformed envelopes and mismatched symbols', () => { assert.throws(() => parseInstruments({})); assert.deepEqual(parseInstruments([{}]),[]); assert.throws(() => parseTicker({},instrument.symbol)); assert.equal(parseTicker([{symbol:'BTCUSDT'}],instrument.symbol),null); assert.throws(() => parseTicker([{symbol:instrument.symbol}],instrument.symbol)); });
