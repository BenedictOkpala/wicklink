import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDeterministicSignals } from '../lib/investigation/signals.ts';
import { evaluateHypotheses } from '../lib/investigation/hypotheses.ts';
import { isSupportedSymbol } from '../lib/investigation/symbols.ts';
import { requestAiInvestigation, parseAiOutput } from '../lib/ai/request.ts';
import { buildUserPrompt, SYSTEM_PROMPT } from '../lib/ai/prompts.ts';
import type { InvestigationEvidence } from '../lib/investigation/types.ts';

function createMockEvidence(overrides: Partial<InvestigationEvidence> = {}): InvestigationEvidence {
  return {
    symbol: 'AAPL',
    displayName: 'Apple Inc.',
    tokenizedSymbol: 'RAAPLUSDT',
    quoteCurrency: 'USDT',
    referenceCurrency: 'USD',
    tokenizedPrice: 335.00,
    referencePrice: 335.00,
    rawDislocationPercent: 0.00,
    dislocationDirection: 'flat',
    absoluteDifference: 0.00,
    priceDifference: 0.00,
    tokenizedTimestamp: '2026-09-18T15:00:00.000Z',
    referenceTimestamp: '2026-09-18T15:00:01.000Z',
    tokenizedAgeMs: 5000,
    referenceAgeMs: 4000,
    timestampSkewMs: 1000,
    marketSession: 'REGULAR',
    sessionSource: 'Bitget Reality schedule + calendar',
    sessionDiagnostic: null,
    comparisonStatus: 'AVAILABLE',
    dataStatus: 'LIVE',
    bitgetStatus: 'LIVE',
    referenceStatus: 'LIVE',
    referenceSource: 'Alpaca IEX',
    referenceType: 'TRADE',
    referenceBid: 334.98,
    referenceAsk: 335.02,
    referenceSpreadPercent: 0.0119,
    bitgetBid1Price: 334.95,
    bitgetAsk1Price: 335.05,
    bitgetBid1Size: 50,
    bitgetAsk1Size: 45,
    bitgetSpreadAmount: 0.10,
    bitgetSpreadPercent: 0.0298,
    bitgetVolume24h: 1200000,
    bitgetTurnover24h: 400000000,
    bitgetHigh24h: 338.00,
    bitgetLow24h: 332.00,
    bitgetPriceChange24hPcnt: 0.85,
    orderbook: {
      bids: [{ price: 334.95, size: 50 }],
      asks: [{ price: 335.05, size: 45 }],
      timestamp: '2026-09-18T15:00:00.000Z',
      spreadAmount: 0.10,
      spreadPercent: 0.0298,
    },
    limitations: ['Raw USDT vs USD comparison without FX rate adjustment.'],
    catalyst: {
      status: 'NO_CATALYSTS_FOUND',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'AAPL',
      windowHours: 48,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'No qualifying catalyst headlines found within 48h window.',
    },
    ...overrides,
  };
}

test('supported symbol validation accepts confirmed Reality candidates and rejects others', () => {
  assert.equal(isSupportedSymbol('AAPL'), true);
  assert.equal(isSupportedSymbol('aapl'), true);
  assert.equal(isSupportedSymbol('NVDA'), true);
  assert.equal(isSupportedSymbol('TSLA'), true);
  assert.equal(isSupportedSymbol('MSFT'), true);
  assert.equal(isSupportedSymbol('GOOGL'), true);
  assert.equal(isSupportedSymbol('XYZ'), false);
  assert.equal(isSupportedSymbol('BTC'), false);
  assert.equal(isSupportedSymbol(''), false);
});

test('deterministic signals correctly categorize dislocation magnitudes under research heuristics', () => {
  // Minimal: < 0.05%
  const minimal = deriveDeterministicSignals(createMockEvidence({ rawDislocationPercent: 0.02 }));
  const dislocMin = minimal.find(s => s.id === 'DISLOCATION_MAGNITUDE');
  assert.ok(dislocMin);
  assert.equal(dislocMin.severity, 'INFO');
  assert.ok(dislocMin.value.includes('Minimal'));

  // Moderate: 0.05% - 0.25%
  const moderate = deriveDeterministicSignals(createMockEvidence({ rawDislocationPercent: -0.15 }));
  const dislocMod = moderate.find(s => s.id === 'DISLOCATION_MAGNITUDE');
  assert.ok(dislocMod);
  assert.equal(dislocMod.severity, 'INFO');
  assert.ok(dislocMod.value.includes('Moderate'));

  // Significant: > 0.25%
  const significant = deriveDeterministicSignals(createMockEvidence({ rawDislocationPercent: 0.45 }));
  const dislocSig = significant.find(s => s.id === 'DISLOCATION_MAGNITUDE');
  assert.ok(dislocSig);
  assert.equal(dislocSig.severity, 'ALERT');
  assert.ok(dislocSig.value.includes('Significant'));

  // Withheld
  const withheld = deriveDeterministicSignals(createMockEvidence({ rawDislocationPercent: null }));
  const dislocWithheld = withheld.find(s => s.id === 'DISLOCATION_MAGNITUDE');
  assert.ok(dislocWithheld);
  assert.equal(dislocWithheld.severity, 'WARNING');
  assert.ok(dislocWithheld.value.includes('Withheld'));
});

test('deterministic signals correctly categorize freshness and timestamp skew', () => {
  // Fresh (<15s) and tight (<5s)
  const fresh = deriveDeterministicSignals(createMockEvidence({ tokenizedAgeMs: 4000, referenceAgeMs: 5000, timestampSkewMs: 1000 }));
  const tokFresh = fresh.find(s => s.id === 'TOKENIZED_FRESHNESS');
  const refFresh = fresh.find(s => s.id === 'REFERENCE_FRESHNESS');
  const skewSignal = fresh.find(s => s.id === 'TIMESTAMP_ALIGNMENT');
  assert.ok(tokFresh?.value.includes('Recent'));
  assert.ok(refFresh?.value.includes('Recent'));
  assert.ok(skewSignal?.value.includes('Tight'));

  // Stale (>60s) and wide skew (>30s)
  const stale = deriveDeterministicSignals(createMockEvidence({ tokenizedAgeMs: 70000, referenceAgeMs: 80000, timestampSkewMs: 35000 }));
  const tokStale = stale.find(s => s.id === 'TOKENIZED_FRESHNESS');
  const skewAlert = stale.find(s => s.id === 'TIMESTAMP_ALIGNMENT');
  assert.equal(tokStale?.severity, 'WARNING');
  assert.ok(tokStale?.value.includes('Stale'));
  assert.equal(skewAlert?.severity, 'ALERT');
  assert.ok(skewAlert?.value.includes('Exceeds limit'));
});

test('deterministic signals reflect market session and liquidity spread', () => {
  const regular = deriveDeterministicSignals(createMockEvidence({ marketSession: 'REGULAR', bitgetSpreadPercent: 0.03 }));
  const regSession = regular.find(s => s.id === 'MARKET_SESSION_CONTEXT');
  const regLiq = regular.find(s => s.id === 'LIQUIDITY_CONTEXT');
  assert.equal(regSession?.value, 'REGULAR');
  assert.equal(regSession?.severity, 'INFO');
  assert.ok(regLiq?.value.includes('Tight'));

  const overnight = deriveDeterministicSignals(createMockEvidence({ marketSession: 'OVERNIGHT', bitgetSpreadPercent: 0.22 }));
  const onSession = overnight.find(s => s.id === 'MARKET_SESSION_CONTEXT');
  const onLiq = overnight.find(s => s.id === 'LIQUIDITY_CONTEXT');
  assert.equal(onSession?.value, 'OVERNIGHT');
  assert.equal(onSession?.severity, 'WARNING');
  assert.ok(onLiq?.value.includes('Wide'));
});

test('hypothesis framework generates all 6 standard categories with correct evidence separation', () => {
  const evidence = createMockEvidence();
  const hypotheses = evaluateHypotheses(evidence);

  assert.equal(hypotheses.length, 6);
  const ids = hypotheses.map(h => h.id).sort();
  assert.deepEqual(ids, [
    'INSUFFICIENT_EVIDENCE',
    'LIQUIDITY_IMBALANCE',
    'MARKET_EVENT',
    'OFF_HOURS_PRICE_DISCOVERY',
    'REFERENCE_LAG',
    'TOKENIZED_MARKET_LAG',
  ]);

  for (const h of hypotheses) {
    assert.ok(h.id);
    assert.ok(h.title);
    assert.ok(h.description);
    assert.ok(Array.isArray(h.supportingEvidence));
    assert.ok(Array.isArray(h.contradictingEvidence));
    assert.ok(h.confidence >= 0 && h.confidence <= 1);
    assert.ok(['SUPPORTED', 'PLAUSIBLE', 'WEAK', 'UNRESOLVED'].includes(h.status));
  }
});

test('MARKET_EVENT hypothesis remains UNRESOLVED without verified news/event feeds', () => {
  const hypotheses = evaluateHypotheses(createMockEvidence({ rawDislocationPercent: 1.5 }));
  const marketEvent = hypotheses.find(h => h.id === 'MARKET_EVENT');
  assert.ok(marketEvent);
  assert.equal(marketEvent.status, 'UNRESOLVED');
  assert.equal(marketEvent.confidence, 0.1);
  assert.ok(marketEvent.supportingEvidence.some(e => e.includes('No qualifying catalyst evidence identified')));
  assert.ok(marketEvent.contradictingEvidence.some(e => e.includes('zero qualifying news headlines')));
});

test('regression: recent but generic ticker-associated article does NOT automatically produce SUPPORTED', () => {
  // Real live NVDA example: Macro roundup where NVDA is merely tagged
  const nvdaRoundupEv = createMockEvidence({
    symbol: 'NVDA',
    catalyst: {
      status: 'AVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'NVDA',
      windowHours: 48,
      articles: [{
        id: 'news-nvda-roundup',
        headline: 'Fed Raises Rates, Yields Hit 2007 Highs as Fuel Costs Set Records: This Week On Wall Street',
        source: 'Benzinga',
        publishedAt: '2026-09-18T07:00:00.000Z', // 8h ago (RECENT)
        url: 'https://example.com/nvda-roundup',
        symbols: ['NVDA', 'SMCI', 'SPY', 'QQQ'],
        ageRelativeMs: 8 * 3600 * 1000,
        relevance: 'RECENT',
        temporalRelevance: 'RECENT',
        assetRelevance: 'BASKET_OR_INDEX',
        explanatoryCategory: 'GENERIC_ROUNDUP',
        isMaterialCatalyst: false,
        summary: 'Weekly market summary.',
      }],
      breakingCount: 0,
      recentCount: 1,
      materialCount: 0,
      issue: null,
    },
  });
  const nvdaHypo = evaluateHypotheses(nvdaRoundupEv).find(h => h.id === 'MARKET_EVENT');
  assert.ok(nvdaHypo);
  assert.equal(nvdaHypo.status, 'WEAK');
  assert.equal(nvdaHypo.confidence, 0.15);
  assert.ok(nvdaHypo.contradictingEvidence.some(e => e.includes('Broad market roundups')));

  // Real live AAPL example: Politician portfolio disclosure
  const aaplDisclosureEv = createMockEvidence({
    symbol: 'AAPL',
    catalyst: {
      status: 'AVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'AAPL',
      windowHours: 48,
      articles: [{
        id: 'news-aapl-disc',
        headline: "Congressman Ditches Magnificent Seven Stocks for Consumer Staples: Here's What He Bought",
        source: 'Benzinga',
        publishedAt: '2026-09-18T06:00:00.000Z', // 9h ago (RECENT)
        url: 'https://example.com/aapl-disc',
        symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
        ageRelativeMs: 9 * 3600 * 1000,
        relevance: 'RECENT',
        temporalRelevance: 'RECENT',
        assetRelevance: 'BASKET_OR_INDEX',
        explanatoryCategory: 'PORTFOLIO_DISCLOSURE',
        isMaterialCatalyst: false,
        summary: 'Lawmaker disclosure.',
      }],
      breakingCount: 0,
      recentCount: 1,
      materialCount: 0,
      issue: null,
    },
  });
  const aaplHypo = evaluateHypotheses(aaplDisclosureEv).find(h => h.id === 'MARKET_EVENT');
  assert.ok(aaplHypo);
  assert.equal(aaplHypo.status, 'WEAK');
  assert.equal(aaplHypo.confidence, 0.15);
});

test('regression: breaking but unrelated or generic article does NOT automatically produce SUPPORTED', () => {
  // Breaking (published 20m ago), but a broad market roundup or portfolio disclosure
  const breakingGenericEv = createMockEvidence({
    symbol: 'NVDA',
    catalyst: {
      status: 'AVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'NVDA',
      windowHours: 48,
      articles: [{
        id: 'news-breaking-generic',
        headline: 'Fed Chair Powell Concludes Emergency Rate Remarks as Tech Basket Fluctuates',
        source: 'MarketWatch',
        publishedAt: '2026-09-18T14:40:00.000Z', // 20m ago (BREAKING)
        url: 'https://example.com/breaking-generic',
        symbols: ['NVDA', 'AAPL', 'MSFT', 'AMD', 'SPY'],
        ageRelativeMs: 20 * 60 * 1000,
        relevance: 'BREAKING',
        temporalRelevance: 'BREAKING',
        assetRelevance: 'BASKET_OR_INDEX',
        explanatoryCategory: 'GENERIC_ROUNDUP',
        isMaterialCatalyst: false,
        summary: null,
      }],
      breakingCount: 1,
      recentCount: 0,
      materialCount: 0,
      issue: null,
    },
  });
  const breakingGenericHypo = evaluateHypotheses(breakingGenericEv).find(h => h.id === 'MARKET_EVENT');
  assert.ok(breakingGenericHypo);
  assert.equal(breakingGenericHypo.status, 'WEAK');
  assert.equal(breakingGenericHypo.confidence, 0.15);
});

test('regression: clearly asset-specific material event can elevate MARKET_EVENT', () => {
  // Breaking material corporate event (<= 2h)
  const breakingMaterialEv = createMockEvidence({
    symbol: 'NVDA',
    catalyst: {
      status: 'AVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'NVDA',
      windowHours: 48,
      articles: [{
        id: 'news-mat-1',
        headline: 'NVIDIA Reports Q3 Revenue Beat of $35.1B and Raises Datacenter Guidance',
        source: 'Benzinga',
        publishedAt: '2026-09-18T14:30:00.000Z', // 30m ago (BREAKING)
        url: 'https://example.com/nvda-earnings',
        symbols: ['NVDA'],
        ageRelativeMs: 30 * 60 * 1000,
        relevance: 'BREAKING',
        temporalRelevance: 'BREAKING',
        assetRelevance: 'PRIMARY_FOCUS',
        explanatoryCategory: 'MATERIAL_CORPORATE_EVENT',
        isMaterialCatalyst: true,
        summary: 'Revenue beat consensus by 14%.',
      }],
      breakingCount: 1,
      recentCount: 0,
      materialCount: 1,
      issue: null,
    },
  });
  const breakingMatHypo = evaluateHypotheses(breakingMaterialEv).find(h => h.id === 'MARKET_EVENT');
  assert.equal(breakingMatHypo?.status, 'SUPPORTED');
  assert.equal(breakingMatHypo?.confidence, 0.70);
  assert.ok(breakingMatHypo?.supportingEvidence.some(e => e.includes('[BREAKING MATERIAL CATALYST]')));

  // Recent material corporate event (2h - 24h)
  const recentMaterialEv = createMockEvidence({
    symbol: 'NVDA',
    catalyst: {
      status: 'AVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'NVDA',
      windowHours: 48,
      articles: [{
        id: 'news-mat-2',
        headline: 'NVIDIA Confirms Regulatory Clearance for Strategic Datacenter Acquisition',
        source: 'Reuters',
        publishedAt: '2026-09-18T05:00:00.000Z', // 10h ago (RECENT)
        url: 'https://example.com/nvda-acq',
        symbols: ['NVDA'],
        ageRelativeMs: 10 * 3600 * 1000,
        relevance: 'RECENT',
        temporalRelevance: 'RECENT',
        assetRelevance: 'PRIMARY_FOCUS',
        explanatoryCategory: 'MATERIAL_CORPORATE_EVENT',
        isMaterialCatalyst: true,
        summary: null,
      }],
      breakingCount: 0,
      recentCount: 1,
      materialCount: 1,
      issue: null,
    },
  });
  const recentMatHypo = evaluateHypotheses(recentMaterialEv).find(h => h.id === 'MARKET_EVENT');
  assert.equal(recentMatHypo?.status, 'PLAUSIBLE');
  assert.equal(recentMatHypo?.confidence, 0.40);
});

test('regression: no articles or zero qualifying headlines remains UNRESOLVED', () => {
  const emptyEv = createMockEvidence({
    symbol: 'AAPL',
    catalyst: {
      status: 'NO_CATALYSTS_FOUND',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'AAPL',
      windowHours: 48,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'No qualifying catalyst headlines found within 48h window.',
    },
  });
  const emptyHypo = evaluateHypotheses(emptyEv).find(h => h.id === 'MARKET_EVENT');
  assert.equal(emptyHypo?.status, 'UNRESOLVED');
  assert.equal(emptyHypo?.confidence, 0.10);
  assert.ok(emptyHypo?.contradictingEvidence.some(e => e.includes('zero qualifying news headlines')));
});

test('regression: provider failure and unconfigured state remain UNRESOLVED', () => {
  // Provider failure (HTTP error / timeout)
  const failedEv = createMockEvidence({
    symbol: 'AAPL',
    catalyst: {
      status: 'UNAVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'AAPL',
      windowHours: 48,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'News provider request failed with HTTP 500.',
    },
  });
  const failedHypo = evaluateHypotheses(failedEv).find(h => h.id === 'MARKET_EVENT');
  assert.equal(failedHypo?.status, 'UNRESOLVED');
  assert.equal(failedHypo?.confidence, 0.10);
  assert.ok(failedHypo?.contradictingEvidence.some(e => e.includes('unavailable')));

  // Unconfigured credentials
  const unconfiguredEv = createMockEvidence({
    symbol: 'AAPL',
    catalyst: {
      status: 'UNCONFIGURED',
      provider: 'Alpaca Market News',
      searchedAt: '2026-09-18T15:00:00.000Z',
      symbol: 'AAPL',
      windowHours: 48,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'Catalyst news credentials are not configured.',
    },
  });
  const unconfiguredHypo = evaluateHypotheses(unconfiguredEv).find(h => h.id === 'MARKET_EVENT');
  assert.equal(unconfiguredHypo?.status, 'UNRESOLVED');
  assert.equal(unconfiguredHypo?.confidence, 0.10);
  assert.ok(unconfiguredHypo?.contradictingEvidence.some(e => e.includes('credentials are not configured')));
});

test('synchronized feeds evaluate REFERENCE_LAG and TOKENIZED_MARKET_LAG both to WEAK without forcing a winner', () => {
  // Feeds with 1 second difference
  const synchedEv = createMockEvidence({
    tokenizedAgeMs: 4000,
    referenceAgeMs: 5000,
    timestampSkewMs: 1000,
    marketSession: 'REGULAR',
    comparisonStatus: 'AVAILABLE',
    rawDislocationPercent: 0.85, // Dislocation exists, but both feeds are fresh
  });
  const hypotheses = evaluateHypotheses(synchedEv);
  const refLag = hypotheses.find(h => h.id === 'REFERENCE_LAG');
  const tokLag = hypotheses.find(h => h.id === 'TOKENIZED_MARKET_LAG');

  assert.equal(refLag?.status, 'WEAK');
  assert.equal(tokLag?.status, 'WEAK');
  assert.equal(refLag?.confidence, 0.15);
  assert.equal(tokLag?.confidence, 0.15);
  assert.ok(refLag?.contradictingEvidence.some(e => e.includes('Feeds are synchronized within')));
  assert.ok(tokLag?.contradictingEvidence.some(e => e.includes('Feeds are synchronized within')));
});

test('all hypotheses expose missingEvidence and confidenceRationale with heuristic disclaimer', () => {
  const evidence = createMockEvidence();
  const hypotheses = evaluateHypotheses(evidence);

  for (const h of hypotheses) {
    assert.ok(Array.isArray(h.missingEvidence), `${h.id} should have missingEvidence array`);
    assert.ok(h.missingEvidence.length > 0, `${h.id} should document at least one missing evidence item to elevate`);
    assert.ok(typeof h.confidenceRationale === 'string' && h.confidenceRationale.length > 0, `${h.id} should have confidenceRationale string`);
  }
});

test('OFF_HOURS_PRICE_DISCOVERY is SUPPORTED during overnight and WEAK during regular session', () => {
  const regularHypo = evaluateHypotheses(createMockEvidence({ marketSession: 'REGULAR' }));
  const regOffHours = regularHypo.find(h => h.id === 'OFF_HOURS_PRICE_DISCOVERY');
  assert.equal(regOffHours?.status, 'WEAK');

  const overnightHypo = evaluateHypotheses(createMockEvidence({ marketSession: 'OVERNIGHT', referenceType: 'INDICATIVE_MIDPOINT' }));
  const onOffHours = overnightHypo.find(h => h.id === 'OFF_HOURS_PRICE_DISCOVERY');
  assert.equal(onOffHours?.status, 'SUPPORTED');
  assert.ok(onOffHours?.confidence && onOffHours.confidence > 0.7);
});

test('regression: CLOSED session wording consistency ensures no contradictory active cash auction claims', () => {
  const closedEvidence = createMockEvidence({
    marketSession: 'CLOSED',
    referenceType: null,
    comparisonStatus: 'UNAVAILABLE',
    referenceStatus: 'DELAYED',
  });
  const hypotheses = evaluateHypotheses(closedEvidence);
  const offHours = hypotheses.find(h => h.id === 'OFF_HOURS_PRICE_DISCOVERY');
  assert.ok(offHours, 'OFF_HOURS_PRICE_DISCOVERY must exist');
  assert.equal(offHours.status, 'SUPPORTED', 'Should be SUPPORTED during CLOSED session');
  assert.equal(offHours.confidence, 0.85, 'Heuristic score should be 0.85 for off-hours session');

  // Verify supporting evidence explicitly states continuous auctions are closed
  const hasClosedAuctionStatement = offHours.supportingEvidence.some(s =>
    s.toLowerCase().includes('continuous auctions are closed') ||
    s.toLowerCase().includes('continuous auctions are inactive')
  );
  assert.ok(hasClosedAuctionStatement, 'Supporting evidence must state continuous auctions are closed');

  // Verify confidence rationale explicitly notes continuous cash auctions are closed/inactive, never active
  assert.ok(offHours.confidenceRationale, 'Confidence rationale must be defined');
  assert.ok(
    offHours.confidenceRationale.toLowerCase().includes('continuous equity cash auctions are closed') ||
    offHours.confidenceRationale.toLowerCase().includes('continuous equity cash auctions are inactive'),
    'Confidence rationale must confirm cash auctions are closed'
  );
  assert.ok(
    !offHours.confidenceRationale.toLowerCase().includes('continuous equity cash auctions are active'),
    'Confidence rationale must NEVER state continuous equity cash auctions are active during CLOSED session'
  );

  // Across ALL 6 hypotheses during CLOSED session, verify no contradictory statement claims cash trading is active
  for (const h of hypotheses) {
    for (const sup of h.supportingEvidence) {
      assert.ok(!sup.toLowerCase().includes('primary exchange trading active'), `${h.id} supporting evidence must not claim active cash trading when session is CLOSED`);
    }
    for (const con of h.contradictingEvidence) {
      assert.ok(!con.toLowerCase().includes('primary exchange trading active'), `${h.id} contradicting evidence must not claim active cash trading when session is CLOSED`);
    }
    if (h.confidenceRationale) {
      assert.ok(!h.confidenceRationale.toLowerCase().includes('primary cash equity market is open'), `${h.id} rationale must not claim primary cash market is open when session is CLOSED`);
    }
  }
});


test('INSUFFICIENT_EVIDENCE is SUPPORTED when price or reference is unavailable or stale', () => {
  const missingRef = evaluateHypotheses(createMockEvidence({ referencePrice: null, comparisonStatus: 'UNAVAILABLE' }));
  const missingHypo = missingRef.find(h => h.id === 'INSUFFICIENT_EVIDENCE');
  assert.equal(missingHypo?.status, 'SUPPORTED');
  assert.ok(missingHypo?.confidence && missingHypo.confidence > 0.8);

  const freshLive = evaluateHypotheses(createMockEvidence());
  const freshHypo = freshLive.find(h => h.id === 'INSUFFICIENT_EVIDENCE');
  assert.equal(freshHypo?.status, 'WEAK');
});

test('AI provider returns AI_ANALYSIS_UNAVAILABLE gracefully when no API credentials are configured', async () => {
  const evidence = createMockEvidence();
  const signals = deriveDeterministicSignals(evidence);
  const hypotheses = evaluateHypotheses(evidence);

  const result = await requestAiInvestigation({ evidence, signals, hypotheses }, undefined);
  assert.equal(result.status, 'AI_ANALYSIS_UNAVAILABLE');
  assert.equal(result.output, null);
  assert.ok(result.issue?.includes('AI API credentials are not configured'));
});

test('AI provider handles HTTP errors gracefully without throwing', async () => {
  const evidence = createMockEvidence();
  const signals = deriveDeterministicSignals(evidence);
  const hypotheses = evaluateHypotheses(evidence);

  const mockFetcher = async () => new Response('Internal Server Error', { status: 500 });
  const result = await requestAiInvestigation({ evidence, signals, hypotheses }, 'test-key', 'https://mock.ai', 'test-model', mockFetcher as unknown as typeof fetch);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.output, null);
  assert.ok(result.issue?.includes('HTTP 500'));
});

test('AI output parser validates well-formed JSON and rejects malformed schema', () => {
  // Valid output
  const valid = {
    assessment: {
      summary: 'Dislocation is within normal spread bounds.',
      primaryExplanation: 'Off-hours liquidity difference.',
      dislocationVerdict: 'MARKET_STRUCTURE_EFFECT',
      keyRisks: ['Spread risk'],
      keyEvidencePoints: ['Bitget spread 0.03%'],
      limitations: ['Raw comparison'],
    },
    hypotheses: [
      {
        id: 'LIQUIDITY_IMBALANCE',
        title: 'Liquidity Imbalance',
        description: 'Test description',
        supportingEvidence: ['Spread observed'],
        contradictingEvidence: [],
        confidence: 0.6,
        status: 'PLAUSIBLE',
      },
    ],
  };
  const parsed = parseAiOutput(valid);
  assert.ok(parsed);
  assert.equal(parsed.assessment.dislocationVerdict, 'MARKET_STRUCTURE_EFFECT');
  assert.equal(parsed.hypotheses.length, 1);
  assert.equal(parsed.hypotheses[0].status, 'PLAUSIBLE');

  // Malformed output (missing summary)
  const invalid = { assessment: { primaryExplanation: 'Foo' }, hypotheses: [] };
  assert.equal(parseAiOutput(invalid), null);
  assert.equal(parseAiOutput('not an object'), null);
});

test('AI system prompt and user prompt strictly enforce objective analysis and exclude buy/sell signals', () => {
  assert.ok(SYSTEM_PROMPT.includes('DO NOT generate trade signals, buy/sell/hold recommendations'));
  assert.ok(SYSTEM_PROMPT.includes('DO NOT invent, assume, or hallucinate external events'));
  assert.ok(SYSTEM_PROMPT.includes('DO NOT convert correlation to causation'));
  assert.ok(SYSTEM_PROMPT.includes('DO NOT expose hidden chain-of-thought'));

  const evidence = createMockEvidence();
  const signals = deriveDeterministicSignals(evidence);
  const hypotheses = evaluateHypotheses(evidence);
  const prompt = buildUserPrompt({ evidence, signals, hypotheses });

  assert.ok(prompt.includes('AAPL'));
  assert.ok(prompt.includes('RAAPLUSDT'));
  assert.ok(prompt.includes('DISLOCATION_MAGNITUDE'));
  assert.ok(prompt.includes('LIQUIDITY_IMBALANCE'));
  assert.ok(prompt.includes('dislocationVerdict'));
  assert.ok(prompt.includes('catalystEvidence'));
});

