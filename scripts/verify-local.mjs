import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateDislocation } from '../lib/dislocation/calculate.ts';

// Read-only integration check against a separately started production server.
const origin = 'http://127.0.0.1:3000';
const requireAlpaca = process.argv.includes('--expect-alpaca');
const response = await fetch(`${origin}/api/market`);
assert.equal(response.status, 200);
const body = await response.json();
assert.deepEqual(body.assets.map(asset => asset.tokenizedSymbol).sort(), ['RAAPLUSDT', 'RNVDAUSDT', 'RTSLAUSDT']);
assert.equal(body.sessionDiagnostics.sessionSource, 'Bitget Reality schedule + calendar');
assert.equal(body.sessionDiagnostics.evaluatedAt, body.fetchedAt);
for (const asset of body.assets) {
  assert.equal(asset.marketSession, body.sessionDiagnostics.session);
  assert.equal(asset.sessionSource, body.sessionDiagnostics.sessionSource);
  assert.ok(asset.tokenizedPrice > 0, `${asset.symbol} must have a real Bitget price`);
  assert.ok(asset.tokenizedTimestamp);
  assert.equal(asset.bitgetStatus, 'LIVE');
  if (requireAlpaca) {
    assert.ok(asset.referencePrice > 0, `${asset.symbol} needs a real Alpaca reference`);
    assert.ok(asset.referenceTimestamp);
    assert.ok(['Alpaca IEX', 'Alpaca Overnight Indicative'].includes(asset.referenceSource));
  }
  if (asset.comparisonStatus !== 'AVAILABLE') {
    assert.equal(asset.rawDislocationPercent, null);
    assert.equal(asset.absoluteDifference, null);
    assert.equal(asset.dislocationDirection, null);
  } else {
    assert.ok(asset.tokenizedAgeMs <= 60000 && asset.referenceAgeMs <= 60000 && asset.timestampSkewMs <= 30000);
    assert.equal(asset.rawDislocationPercent, calculateDislocation(asset.referencePrice, asset.tokenizedPrice).percentageDifference);
  }
  if (['UNKNOWN', 'CLOSED', 'PRE_MARKET', 'AFTER_HOURS'].includes(asset.marketSession)) {
    assert.equal(asset.referencePrice, null);
    assert.equal(asset.rawDislocationPercent, null);
  }
  if (asset.referenceType === 'INDICATIVE_MIDPOINT') {
    assert.equal(asset.referencePrice, asset.referenceBid / 2 + asset.referenceAsk / 2);
  }
}
const page = await fetch(origin);
assert.equal(page.status, 200);
const html = await page.text();
for (const label of ['Market Monitor', 'REALITY MARKET OVERVIEW', 'MARKET EVIDENCE', 'ACTIVITY', 'Investigations', 'Data Sources', 'System Status']) {
  assert.ok(html.includes(label), `${label} must be server rendered`);
}
assert.equal((html.match(/aria-controls="asset-detail"/g) ?? []).length, 3);
if (body.sessionDiagnostics.timezoneDiagnostic) assert.ok(html.includes('Timezone diagnostic:'));
const post = await fetch(`${origin}/api/market`, { method: 'POST' });
assert.equal(post.status, 405);
const filename = 'docs/ui-market-response.json';
fs.writeFileSync(filename, `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify({ dashboard: page.status, api: response.status, post: post.status, alpacaRequired: requireAlpaca, fetchedAt: body.fetchedAt, sessionDiagnostics: body.sessionDiagnostics, assets: body.assets, evidence: filename }, null, 2));
