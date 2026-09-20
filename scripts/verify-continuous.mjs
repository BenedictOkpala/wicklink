import assert from 'node:assert/strict';

const res = await fetch('http://localhost:3000');
assert.equal(res.status, 200, 'Page must return 200');
const html = await res.text();

const sections = [
  'section-overview',
  'section-markets',
  'section-investigations',
  'section-sources',
  'section-system',
];

for (const id of sections) {
  assert.ok(html.includes(`id="${id}"`), `Section #${id} must be rendered in continuous DOM`);
}

// Verify key content markers across all 5 stacked sections
assert.ok(html.includes('overview-watch-title'), 'Ranked Overview heading must be present');
assert.ok(!html.includes('Why dislocations happen'), 'Old Overview educational block must be removed');
assert.ok(html.includes('REALITY MARKET OVERVIEW'), 'Markets overview table must be present');
assert.ok(html.includes('MARKET EVIDENCE'), 'Market evidence / detail card must be present');
assert.ok(html.includes('ACTIVITY'), 'Activity panel must be present');
assert.ok(html.includes('RESEARCH WORKSPACE') || html.includes('INVESTIGATION'), 'Investigations section must be present');
assert.ok(html.includes('Verified Sources &amp; Clear Provenance') || html.includes('Verified Sources & Clear Provenance'), 'Data sources section must be present');
assert.ok(html.includes('System Status') || html.includes('Bitget') && html.includes('Alpaca'), 'System status section must be present');

// Verify sticky header elements
assert.ok(html.includes('WickLink Intelligence'), 'Eyebrow must be present');
assert.ok(html.includes('workspace-header'), 'Sticky header must be present');

// Verify sidebar navigation items with tooltips and aria-labels
for (const label of ['Overview', 'Markets', 'Investigations', 'Methodology', 'System Status']) {
  assert.ok(html.includes(`aria-label="${label}"`), `Nav button for ${label} must be present`);
  assert.ok(html.includes(`data-tooltip="${label}"`), `Tooltip for ${label} must be present`);
}

// Verify API endpoints
const marketRes = await fetch('http://localhost:3000/api/market');
assert.equal(marketRes.status, 200, 'Market API must return 200');
const marketData = await marketRes.json();
assert.ok(Array.isArray(marketData.assets), 'Market API must return assets array');
assert.equal(marketData.assets.length, 14, 'Must monitor 14 assets');

const invRes = await fetch('http://localhost:3000/api/investigate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbol: 'NVDA' }),
});
assert.equal(invRes.status, 200, 'Investigation API must return 200');
const invData = await invRes.json();
assert.equal(invData.symbol, 'NVDA', 'Investigation report must be for NVDA');
assert.equal(invData.hypotheses.length, 6, 'Investigation must contain 6 hypotheses');

console.log('ALL CONTINUOUS SCROLL & API VERIFICATIONS PASSED!');


