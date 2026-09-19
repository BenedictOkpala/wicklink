import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAssetRelevance,
  classifyExplanatoryCategory,
  classifyRelevance,
  normalizeCatalystNews,
} from '../lib/catalyst/normalize.ts';
import { requestCatalystNews } from '../lib/catalyst/request.ts';

test('classifyAssetRelevance discriminates primary focus vs secondary vs basket mentions', () => {
  // Primary focus: single symbol and mentioned in headline
  assert.equal(
    classifyAssetRelevance('NVIDIA Reports Record Q3 Revenue of $35B', ['NVDA'], 'NVDA'),
    'PRIMARY_FOCUS'
  );
  // Primary focus: Company name in headline
  assert.equal(
    classifyAssetRelevance('Apple Unveils M4 Chip Lineup in Special Keynote', ['AAPL'], 'AAPL'),
    'PRIMARY_FOCUS'
  );
  // Secondary mention: Ticker in symbol list, but headline mentions other topics
  assert.equal(
    classifyAssetRelevance('Tech Sector Midday Trading Notes', ['NVDA'], 'NVDA'),
    'SECONDARY_MENTION'
  );
  // Basket: >3 tickers tagged, not named in headline
  assert.equal(
    classifyAssetRelevance('Fed Raises Rates, Yields Hit Highs: This Week On Wall Street', ['NVDA', 'MSFT', 'AAPL', 'AMZN'], 'NVDA'),
    'BASKET_OR_INDEX'
  );
});

test('classifyExplanatoryCategory correctly identifies material events vs generic noise', () => {
  // Material corporate event
  assert.equal(
    classifyExplanatoryCategory('NVIDIA Reports Q3 Earnings and Revenue Beat', null),
    'MATERIAL_CORPORATE_EVENT'
  );
  assert.equal(
    classifyExplanatoryCategory('Apple Issues Guidance Cut Due to Supply Chain Disruption', null),
    'MATERIAL_CORPORATE_EVENT'
  );
  assert.equal(
    classifyExplanatoryCategory('SEC Charges Former Executive in Accounting Probe', null),
    'MATERIAL_CORPORATE_EVENT'
  );

  // Generic macro roundup (the NVDA live example)
  assert.equal(
    classifyExplanatoryCategory('Fed Raises Rates, Yields Hit 2007 Highs as Fuel Costs Set Records: This Week On Wall Street', null),
    'GENERIC_ROUNDUP'
  );

  // Portfolio disclosure (the AAPL live example)
  assert.equal(
    classifyExplanatoryCategory("Congressman Ditches Magnificent Seven Stocks for Consumer Staples: Here's What He Bought", null),
    'PORTFOLIO_DISCLOSURE'
  );

  // Analyst commentary
  assert.equal(
    classifyExplanatoryCategory('Analyst Upgrades Apple Ahead of Worldwide Developers Conference', null),
    'ANALYST_OR_PRODUCT'
  );
});

test('classifyRelevance assigns correct temporal tiers relative to observation', () => {
  const windowHours = 48;

  // 15 minutes ago -> BREAKING
  assert.equal(classifyRelevance(15 * 60 * 1000, windowHours), 'BREAKING');
  // Exactly 2 hours ago -> BREAKING
  assert.equal(classifyRelevance(2 * 3600 * 1000, windowHours), 'BREAKING');
  // 2 hours 1 minute ago -> RECENT
  assert.equal(classifyRelevance(2 * 3600 * 1000 + 60000, windowHours), 'RECENT');
  // 12 hours ago -> RECENT
  assert.equal(classifyRelevance(12 * 3600 * 1000, windowHours), 'RECENT');
  // Exactly 24 hours ago -> RECENT
  assert.equal(classifyRelevance(24 * 3600 * 1000, windowHours), 'RECENT');
  // 36 hours ago -> DATED
  assert.equal(classifyRelevance(36 * 3600 * 1000, windowHours), 'DATED');
  // Exactly 48 hours ago -> DATED
  assert.equal(classifyRelevance(48 * 3600 * 1000, windowHours), 'DATED');
  // 49 hours ago -> IRRELEVANT (outside window)
  assert.equal(classifyRelevance(49 * 3600 * 1000, windowHours), 'IRRELEVANT');
  // Far future publication (> 1 min) -> IRRELEVANT
  assert.equal(classifyRelevance(-120000, windowHours), 'IRRELEVANT');
});

test('normalizeCatalystNews parses authentic news items and ignores non-matching symbols', () => {
  const now = Date.parse('2026-09-18T16:00:00.000Z');
  const mockPayload = {
    news: [
      {
        id: 101,
        headline: 'NVIDIA Expands Hopper Architecture Partnerships in Datacenter Sector',
        source: 'Benzinga',
        published_at: '2026-09-18T15:30:00.000Z', // 30m ago (BREAKING)
        url: 'https://www.benzinga.com/markets/26/09/nvda-datacenter',
        symbols: ['NVDA', 'SMCI'],
        summary: 'Datacenter momentum accelerates ahead of quarterly earnings.',
      },
      {
        id: 102,
        headline: 'Tech Sector Morning Overview: Chipmakers and AI Hardware',
        source: 'MarketWatch',
        published_at: '2026-09-18T08:00:00.000Z', // 8h ago (RECENT)
        url: 'https://marketwatch.com/story/tech-morning',
        symbols: ['NVDA', 'AMD', 'INTC'],
        summary: null,
      },
      {
        id: 103,
        headline: 'Tesla Unveils Robotaxi Cybercab Fleet Update in Austin',
        source: 'Benzinga',
        published_at: '2026-09-18T14:00:00.000Z',
        url: 'https://benzinga.com/news/tsla',
        symbols: ['TSLA'], // Not NVDA
        summary: 'Autonomous fleet testing commences.',
      },
      {
        id: 104,
        headline: 'Older NVDA SEC Regulatory Filing from Three Days Ago',
        source: 'SEC Wire',
        published_at: '2026-09-14T10:00:00.000Z', // 4 days ago -> outside 48h window
        url: 'https://sec.gov/edgar/nvda',
        symbols: ['NVDA'],
        summary: null,
      },
      {
        id: 105,
        headline: 'Malicious link headline test',
        source: 'Unknown',
        published_at: '2026-09-18T15:45:00.000Z',
        url: 'javascript:alert(1)', // Unsafe URL
        symbols: ['NVDA'],
        summary: null,
      },
    ],
  };

  const result = normalizeCatalystNews(mockPayload, 'NVDA', now, 48);

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.breakingCount, 2); // 101 and 105
  assert.equal(result.recentCount, 1); // 102
  assert.equal(result.articles.length, 3); // 101, 105, 102 (TSLA excluded, older NVDA excluded)

  // Top article must be the most recent
  assert.equal(result.articles[0]?.headline, 'Malicious link headline test');
  assert.equal(result.articles[0]?.url, null); // javascript: scheme must be sanitized to null
  assert.equal(result.articles[1]?.headline, 'NVIDIA Expands Hopper Architecture Partnerships in Datacenter Sector');
  assert.equal(result.articles[1]?.url, 'https://www.benzinga.com/markets/26/09/nvda-datacenter');
});

test('normalizeCatalystNews handles empty and malformed payloads safely', () => {
  const now = Date.now();
  const emptyRes = normalizeCatalystNews({ news: [] }, 'AAPL', now, 48);
  assert.equal(emptyRes.status, 'NO_CATALYSTS_FOUND');
  assert.equal(emptyRes.articles.length, 0);
  assert.ok(emptyRes.issue?.includes('No qualifying catalyst headlines'));

  const malformed = normalizeCatalystNews({ error: 'bad request' }, 'AAPL', now, 48);
  assert.equal(malformed.status, 'UNAVAILABLE');
  assert.equal(malformed.articles.length, 0);

  const nonObject = normalizeCatalystNews(null, 'AAPL', now, 48);
  assert.equal(nonObject.status, 'UNAVAILABLE');
});

test('requestCatalystNews returns UNCONFIGURED when credentials are missing', async () => {
  const result = await requestCatalystNews('AAPL', { key: '', secret: '' });
  assert.equal(result.status, 'UNCONFIGURED');
  assert.equal(result.articles.length, 0);
  assert.ok(result.issue?.includes('APCA-API-KEY-ID'));
});

test('requestCatalystNews sends correct query parameters and auth headers', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  const mockFetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response(JSON.stringify({ news: [] }), { status: 200 });
  };

  const now = Date.parse('2026-09-18T12:00:00.000Z');
  const result = await requestCatalystNews(
    'TSLA',
    { key: 'test-key-id', secret: 'test-secret-key' },
    mockFetcher as unknown as typeof fetch,
    now,
    48
  );

  assert.equal(result.status, 'NO_CATALYSTS_FOUND');
  assert.ok(capturedUrl.includes('https://data.alpaca.markets/v1beta1/news'));
  assert.ok(capturedUrl.includes('symbols=TSLA'));
  assert.ok(capturedUrl.includes('limit=10'));
  // Start parameter must reflect 48 hours prior
  const expectedStart = new Date(now - 48 * 3600 * 1000).toISOString();
  assert.ok(capturedUrl.includes(`start=${encodeURIComponent(expectedStart)}`));
  assert.equal(capturedHeaders['APCA-API-KEY-ID'], 'test-key-id');
  assert.equal(capturedHeaders['APCA-API-SECRET-KEY'], 'test-secret-key');
});

test('requestCatalystNews handles upstream HTTP errors and network timeouts gracefully', async () => {
  const mockHttpError = async () => new Response('Rate Limit Exceeded', { status: 429 });
  const errResult = await requestCatalystNews(
    'AAPL',
    { key: 'k', secret: 's' },
    mockHttpError as unknown as typeof fetch
  );
  assert.equal(errResult.status, 'UNAVAILABLE');
  assert.ok(errResult.issue?.includes('HTTP 429'));

  const mockNetworkThrow = async () => {
    throw new Error('Connection reset by peer');
  };
  const throwResult = await requestCatalystNews(
    'AAPL',
    { key: 'k', secret: 's' },
    mockNetworkThrow as unknown as typeof fetch
  );
  assert.equal(throwResult.status, 'UNAVAILABLE');
  assert.ok(throwResult.issue?.includes('Connection reset by peer'));
});
