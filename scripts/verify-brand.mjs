import assert from 'node:assert/strict';

const res = await fetch('http://localhost:3000');
assert.equal(res.status, 200);
const html = await res.text();

// 1. Page Title & Meta
assert.ok(html.includes('<title>WickLink | Market Dislocation Intelligence</title>'), 'Title must be WickLink');
assert.ok(html.includes('WickLink finds price dislocations'), 'Description must be WickLink description');
assert.ok(html.includes('find the weak link in the market.'), 'Tagline must be present');

// 2. Favicon
assert.ok(html.includes('rel="icon"'), 'Favicon link must be present in HTML head');
assert.ok(html.includes('/favicon.svg'), 'Favicon svg must be referenced');

// 3. Sidebar Brand
assert.ok(html.includes('class="brand-name">WICKLINK</span>'), 'Sidebar brand name must be WickLink');
assert.ok(html.includes('find the weak link in the market.'), 'Brand narrative tagline must be present');

// 4. Header Eyebrow
assert.ok(html.includes('class="header-eyebrow">WickLink Intelligence</span>'), 'Header eyebrow must be WickLink Intelligence');

// 5. Overview Quote & Backdrop
assert.ok(html.includes('WICKLINK / INTELLIGENCE DESK'), 'Overview intelligence desk must feature WickLink');
assert.ok(html.includes('WickLink Investigation Engine V1'), 'Investigation note must feature WickLink');

// 6. Zero public-facing NightShift strings in rendered HTML
assert.ok(!html.includes('NightShift'), 'No public NightShift text in rendered HTML');

console.log('PASS: All public-facing WickLink branding elements verified in live DOM!');


