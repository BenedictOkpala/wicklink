import type { InvestigationEvidence, InvestigationHypothesis } from './types.ts';

/**
 * Organizes supporting, contradicting, and missing evidence for standard explanations.
 *
 * NOTE: As per NightShift design guidelines:
 * 1. This deterministic layer organizes factual evidence and assigns rule-based
 *    diagnostic statuses, but DOES NOT claim to have established causation.
 * 2. Confidence scores are heuristic research indicators (rule-based weights),
 *    not statistically calibrated empirical probabilities.
 * 3. MARKET_EVENT evaluates real catalyst evidence if retrieved, but requires
 *    strict temporal proximity and ticker association to achieve SUPPORTED status.
 *    Without qualifying news, it remains UNRESOLVED.
 * 4. REFERENCE_LAG and TOKENIZED_MARKET_LAG require clear asymmetric latency evidence;
 *    price difference alone when feeds are synchronized never establishes lag.
 */
export function evaluateHypotheses(evidence: InvestigationEvidence): InvestigationHypothesis[] {
  const hypotheses: InvestigationHypothesis[] = [];

  // 1. LIQUIDITY_IMBALANCE
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Proprietary institutional dark pool or multi-venue order-flow aggregation.',
    ];

    if (evidence.bitgetSpreadPercent !== null) {
      if (evidence.bitgetSpreadPercent > 0.1) {
        supporting.push(`Bitget top-of-book spread is relatively wide at ${evidence.bitgetSpreadPercent.toFixed(3)}%.`);
      } else if (evidence.bitgetSpreadPercent < 0.05) {
        contradicting.push(`Bitget top-of-book spread is tight (${evidence.bitgetSpreadPercent.toFixed(3)}%), indicating active quoting.`);
      }
    }

    if (evidence.bitgetBid1Size !== null && evidence.bitgetAsk1Size !== null) {
      const ratio = Math.max(evidence.bitgetBid1Size, evidence.bitgetAsk1Size) / Math.max(1, Math.min(evidence.bitgetBid1Size, evidence.bitgetAsk1Size));
      if (ratio > 3) {
        supporting.push(`Asymmetric top-of-book depth (Bid size: ${evidence.bitgetBid1Size}, Ask size: ${evidence.bitgetAsk1Size}).`);
      } else {
        contradicting.push(`Relatively balanced top-of-book depth (Bid: ${evidence.bitgetBid1Size}, Ask: ${evidence.bitgetAsk1Size}).`);
      }
    }

    if (evidence.rawDislocationPercent !== null && evidence.bitgetSpreadPercent !== null) {
      if (Math.abs(evidence.rawDislocationPercent) <= evidence.bitgetSpreadPercent) {
        supporting.push('Observed price dislocation is within the tokenized venue bid/ask spread band.');
      }
    }

    const isSupported = supporting.length > contradicting.length && (evidence.bitgetSpreadPercent ?? 0) > 0.1;
    const isPlausible = supporting.length > 0;
    const confidence = isSupported ? 0.70 : isPlausible ? 0.45 : 0.20;

    hypotheses.push({
      id: 'LIQUIDITY_IMBALANCE',
      title: 'Liquidity Imbalance & Spread Effect',
      description: 'Price difference may reflect local orderbook thinness, wide quoting spreads, or depth asymmetries on the tokenized venue.',
      supportingEvidence: supporting.length ? supporting : ['No affirmative liquidity friction observed.'],
      contradictingEvidence: contradicting.length ? contradicting : ['No contra-indicators observed.'],
      missingEvidence: missing,
      confidenceRationale: isSupported
        ? 'Heuristic score 0.70: Wide quoting spread (>0.1%) or depth asymmetry confirms local liquidity friction.'
        : isPlausible
        ? 'Heuristic score 0.45: Minor orderbook imbalance detected, but spread remains moderate.'
        : 'Heuristic score 0.20: Tokenized venue quotes are tight with balanced top-of-book liquidity.',
      confidence,
      status: isSupported ? 'SUPPORTED' : isPlausible ? 'PLAUSIBLE' : 'WEAK',
    });
  }

  // 2. OFF_HOURS_PRICE_DISCOVERY
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Continuous primary exchange cash auction trade flow for cross-validation.',
    ];

    if (evidence.marketSession === 'OVERNIGHT') {
      supporting.push('US cash equity markets are in the overnight session; primary exchange continuous auctions are closed.');
      supporting.push(`Reference price is derived from ${evidence.referenceSource ?? 'overnight quotes'} (${evidence.referenceType ?? 'indicative midpoint'}).`);
      supporting.push('Tokenized instruments continue trading 24/7 on Bitget while underlying equity liquidity is fractional.');
    } else if (evidence.marketSession === 'CLOSED' || evidence.marketSession === 'AFTER_HOURS' || evidence.marketSession === 'PRE_MARKET') {
      supporting.push(`US equity reference markets are in ${evidence.marketSession} session; primary exchange continuous auctions are closed.`);
      supporting.push('Tokenized instruments continue trading 24/7 on Bitget while traditional reference markets are closed or inactive.');
    } else if (evidence.marketSession === 'REGULAR') {
      contradicting.push('US cash equity markets are in REGULAR session with primary exchange trading active.');
      contradicting.push(`Reference trade is sourced from live ${evidence.referenceSource ?? 'IEX'} trade data.`);
    }

    const isSupported = evidence.marketSession === 'OVERNIGHT' || evidence.marketSession === 'CLOSED' || evidence.marketSession === 'AFTER_HOURS' || evidence.marketSession === 'PRE_MARKET';
    const isRegular = evidence.marketSession === 'REGULAR';
    const confidence = isSupported ? 0.85 : isRegular ? 0.10 : 0.30;

    hypotheses.push({
      id: 'OFF_HOURS_PRICE_DISCOVERY',
      title: 'Off-Hours Price Discovery',
      description: 'Dislocation reflects independent 24/7 token trading while underlying equity cash exchanges are closed or in overnight extended trading.',
      supportingEvidence: supporting.length ? supporting : ['Session does not indicate off-hours dislocation.'],
      contradictingEvidence: contradicting.length ? contradicting : ['No session contra-evidence.'],
      missingEvidence: missing,
      confidenceRationale: isSupported
        ? `Heuristic score 0.85: Confirmed US market session is ${evidence.marketSession}; continuous equity cash auctions are closed.`
        : isRegular
        ? 'Heuristic score 0.10: Primary cash equity market is open in regular trading hours.'
        : 'Heuristic score 0.30: Market session is unverified or transitional.',
      confidence,
      status: isSupported ? 'SUPPORTED' : isRegular ? 'WEAK' : 'UNRESOLVED',
    });
  }

  // 3. REFERENCE_LAG
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Direct consolidated SIP trade tape timestamps with microsecond precision.',
    ];
    const isSessionClosed = evidence.marketSession === 'CLOSED' || evidence.marketSession === 'AFTER_HOURS' || evidence.marketSession === 'PRE_MARKET';

    const ageDiff = (evidence.referenceAgeMs !== null && evidence.tokenizedAgeMs !== null)
      ? evidence.referenceAgeMs - evidence.tokenizedAgeMs
      : null;
    const isSynchronized = !isSessionClosed && ageDiff !== null && Math.abs(ageDiff) <= 5000;
    const isReferenceLagging = !isSessionClosed && ageDiff !== null && ageDiff > 8000;

    if (isSessionClosed) {
      contradicting.push(`Reference market is currently in session ${evidence.marketSession}. Age of reference trade reflects normal market closure, not transient network lag.`);
    } else if (isSynchronized) {
      contradicting.push(`Feeds are synchronized within ${Math.abs(Math.round((ageDiff ?? 0) / 1000))}s. Price divergence cannot be attributed to reference lag without objective tape delay evidence.`);
    } else if (isReferenceLagging) {
      supporting.push(`Reference trade/quote is ${Math.round(ageDiff / 1000)}s older than the Bitget snapshot.`);
    }

    if (!isSessionClosed && (evidence.referenceStatus === 'DELAYED' || (evidence.referenceAgeMs ?? 0) > 45000)) {
      supporting.push('Reference observation is approaching or exceeding the stale threshold (>45s).');
    }

    const isSupported = !isSessionClosed && (ageDiff !== null && ageDiff > 15000) && evidence.referenceStatus === 'DELAYED';
    const isPlausible = !isSessionClosed && isReferenceLagging;
    const confidence = isSupported ? 0.75 : isPlausible ? 0.55 : isSessionClosed ? 0.20 : 0.15;

    hypotheses.push({
      id: 'REFERENCE_LAG',
      title: 'Reference Observation Latency',
      description: 'The reference market price observation is delayed or older than the tokenized quote, creating a mechanical discrepancy.',
      supportingEvidence: supporting.length ? supporting : ['No reference latency identified.'],
      contradictingEvidence: contradicting.length ? contradicting : ['No contra-indicators.'],
      missingEvidence: missing,
      confidenceRationale: isSessionClosed
        ? `Heuristic score 0.20: Reference age reflects scheduled ${evidence.marketSession} closure, not network feed lag.`
        : isSupported
        ? `Heuristic score 0.75: Reference observation is DELAYED and >15s older than tokenized snapshot.`
        : isPlausible
        ? `Heuristic score 0.55: Reference observation is ${Math.round((ageDiff ?? 0) / 1000)}s older than tokenized quote.`
        : isSynchronized
        ? 'Heuristic score 0.15: Feeds are synchronized within 5s; price difference alone does not prove feed latency.'
        : 'Heuristic score 0.20: Insufficient temporal divergence to demonstrate reference delay.',
      confidence,
      status: isSupported ? 'SUPPORTED' : isPlausible ? 'PLAUSIBLE' : 'WEAK',
    });
  }

  // 4. TOKENIZED_MARKET_LAG
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Sub-second tokenized exchange websocket trade prints and execution fills.',
    ];
    const isSessionClosed = evidence.marketSession === 'CLOSED' || evidence.marketSession === 'AFTER_HOURS' || evidence.marketSession === 'PRE_MARKET';

    const ageDiff = (evidence.tokenizedAgeMs !== null && evidence.referenceAgeMs !== null)
      ? evidence.tokenizedAgeMs - evidence.referenceAgeMs
      : null;
    const isSynchronized = !isSessionClosed && ageDiff !== null && Math.abs(ageDiff) <= 5000;
    const isTokenizedLagging = !isSessionClosed && ageDiff !== null && ageDiff > 8000;

    if (isSessionClosed) {
      contradicting.push(`Underlying reference continuous trading is closed (${evidence.marketSession}); tokenized market is not lagging an active tape.`);
    } else if (isSynchronized) {
      contradicting.push(`Feeds are synchronized within ${Math.abs(Math.round((ageDiff ?? 0) / 1000))}s. Price divergence cannot be attributed to tokenized market lag without orderbook reaction delay evidence.`);
    } else if (isTokenizedLagging) {
      supporting.push(`Bitget snapshot is ${Math.round(ageDiff / 1000)}s older than the latest reference trade.`);
    }

    if (!isSessionClosed && (evidence.bitgetStatus === 'DELAYED' || (evidence.tokenizedAgeMs ?? 0) > 45000)) {
      supporting.push('Bitget snapshot is approaching or exceeding the stale threshold (>45s).');
    }

    const isSupported = !isSessionClosed && (ageDiff !== null && ageDiff > 15000) && evidence.bitgetStatus === 'DELAYED';
    const isPlausible = !isSessionClosed && isTokenizedLagging;
    const confidence = isSupported ? 0.75 : isPlausible ? 0.55 : isSessionClosed ? 0.20 : 0.15;

    hypotheses.push({
      id: 'TOKENIZED_MARKET_LAG',
      title: 'Tokenized Market Reaction Latency',
      description: 'The tokenized market quote has not yet updated to reflect recent underlying equity market moves.',
      supportingEvidence: supporting.length ? supporting : ['No tokenized quote latency identified.'],
      contradictingEvidence: contradicting.length ? contradicting : ['No contra-indicators.'],
      missingEvidence: missing,
      confidenceRationale: isSessionClosed
        ? `Heuristic score 0.20: Underlying equity auction is closed (${evidence.marketSession}); tokenized venue has no active moves to lag.`
        : isSupported
        ? 'Heuristic score 0.75: Tokenized snapshot is DELAYED and >15s older than reference trade.'
        : isPlausible
        ? `Heuristic score 0.55: Tokenized quote is ${Math.round((ageDiff ?? 0) / 1000)}s older than reference trade.`
        : isSynchronized
        ? 'Heuristic score 0.15: Feeds are synchronized within 5s; price difference alone does not prove reaction delay.'
        : 'Heuristic score 0.20: Insufficient temporal divergence to demonstrate tokenized quote delay.',
      confidence,
      status: isSupported ? 'SUPPORTED' : isPlausible ? 'PLAUSIBLE' : 'WEAK',
    });
  }

  // 5. MARKET_EVENT
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Order-flow volume attribution to prove price dislocation was directly catalyst-driven.',
    ];

    const catalyst = evidence.catalyst;
    let status: InvestigationHypothesis['status'] = 'UNRESOLVED';
    let confidence = 0.10;
    let rationale = 'No qualifying catalyst evidence available to evaluate; status remains conservative.';

    if (!catalyst || catalyst.status === 'UNCONFIGURED') {
      contradicting.push('Alpaca API credentials are not configured in server environment.');
      missing.push('Configured Alpaca API credentials to query market news.');
      rationale = 'Heuristic score 0.10: Catalyst news provider unconfigured in server environment.';
      status = 'UNRESOLVED';
      confidence = 0.10;
    } else if (catalyst.status === 'UNAVAILABLE') {
      contradicting.push(`Catalyst news feed query was unavailable: ${catalyst.issue ?? 'query failed'}.`);
      missing.push('Healthy news provider connection.');
      rationale = 'Heuristic score 0.10: Catalyst news feed unavailable or timed out.';
      status = 'UNRESOLVED';
      confidence = 0.10;
    } else if (catalyst.status === 'NO_CATALYSTS_FOUND' || catalyst.articles.length === 0) {
      contradicting.push(`Systematic search found zero qualifying news headlines for ${evidence.symbol} within the ${catalyst.windowHours}h window.`);
      missing.push('Contemporaneous corporate news or unscheduled press releases.');
      rationale = `Heuristic score 0.10: Zero qualifying headlines identified within ${catalyst.windowHours} hours.`;
      status = 'UNRESOLVED';
      confidence = 0.10;
    } else {
      // Articles ARE available. Separate temporal relevance, asset relevance, and explanatory relevance.
      const articles = catalyst.articles;

      // 1. Asset-specific material corporate events (earnings, SEC filings, M&A, FDA, CEO, restructuring)
      const breakingMaterial = articles.filter(a => a.isMaterialCatalyst && a.temporalRelevance === 'BREAKING');
      const recentMaterial = articles.filter(a => a.isMaterialCatalyst && a.temporalRelevance === 'RECENT');
      const datedMaterial = articles.filter(a => a.isMaterialCatalyst && a.temporalRelevance === 'DATED');

      // 2. Asset-specific commentary / analyst / product updates (secondary explanatory power)
      const breakingSpecificCommentary = articles.filter(a =>
        !a.isMaterialCatalyst &&
        a.assetRelevance === 'PRIMARY_FOCUS' &&
        a.explanatoryCategory === 'ANALYST_OR_PRODUCT' &&
        a.temporalRelevance === 'BREAKING'
      );
      const recentSpecificCommentary = articles.filter(a =>
        !a.isMaterialCatalyst &&
        a.assetRelevance === 'PRIMARY_FOCUS' &&
        a.explanatoryCategory === 'ANALYST_OR_PRODUCT' &&
        a.temporalRelevance === 'RECENT'
      );

      if (breakingMaterial.length > 0) {
        // TIER 1: SUPPORTED — High explanatory power + breaking proximity (<=2h)
        status = 'SUPPORTED';
        confidence = 0.70;
        const top = breakingMaterial[0]!;
        const mins = Math.round(top.ageRelativeMs / 60000);
        supporting.push(`[BREAKING MATERIAL CATALYST] "${top.headline}" published ${mins}m before observation by ${top.source}.`);
        if (breakingMaterial.length > 1) {
          supporting.push(`${breakingMaterial.length} asset-specific material event headlines detected within 2 hours.`);
        }
        contradicting.push('Headline existence demonstrates market attention, but mechanical transmission to tokenized basis remains heuristic rather than proven.');
        missing.push('Quantitative order-flow attribution to confirm volume was catalyst-driven.');
        rationale = `Heuristic score 0.70: Asset-specific material corporate event ("${top.headline}") published within 2h of observation.`;
      } else if (recentMaterial.length > 0) {
        // TIER 2: PLAUSIBLE — Material corporate event within 24h
        status = 'PLAUSIBLE';
        confidence = 0.40;
        const top = recentMaterial[0]!;
        const hours = Math.round(top.ageRelativeMs / 3600000);
        supporting.push(`[RECENT MATERIAL CATALYST] "${top.headline}" published ${hours}h before observation by ${top.source}.`);
        contradicting.push(`Material event was published ${hours}h ago (outside immediate 2h window); cash market may have already absorbed the information.`);
        missing.push('Evidence that this specific headline caused the current tokenized price dislocation.');
        rationale = `Heuristic score 0.40: Asset-specific material corporate event occurred ${hours}h ago, but temporal separation weakens direct causal attribution.`;
      } else if (breakingSpecificCommentary.length > 0) {
        // TIER 3: PLAUSIBLE — Asset-specific breaking commentary/product (<=2h), but not a confirmed hard corporate event
        status = 'PLAUSIBLE';
        confidence = 0.35;
        const top = breakingSpecificCommentary[0]!;
        const mins = Math.round(top.ageRelativeMs / 60000);
        supporting.push(`[BREAKING ASSET COMMENTARY] "${top.headline}" published ${mins}m before observation by ${top.source}.`);
        contradicting.push('Analyst coverage, price targets, or product announcements rarely cause persistent cross-market dislocations without structural liquidity failure.');
        missing.push('Evidence of unexpected material financial impact.');
        rationale = `Heuristic score 0.35: Breaking asset-specific commentary detected, but lacks confirmed hard corporate event characteristics.`;
      } else if (datedMaterial.length > 0 || recentSpecificCommentary.length > 0) {
        // TIER 4: WEAK — Dated material event or older commentary
        status = 'WEAK';
        confidence = 0.20;
        const top = datedMaterial[0] ?? recentSpecificCommentary[0]!;
        const hours = Math.round(top.ageRelativeMs / 3600000);
        supporting.push(`[${top.temporalRelevance}] "${top.headline}" published ${hours}h ago by ${top.source}.`);
        contradicting.push(`Event or commentary is older than ${hours}h and unlikely to explain an active intraday dislocation.`);
        missing.push('Fresh material catalysts published within current trading session.');
        rationale = `Heuristic score 0.20: Only older or non-material commentary found; insufficient explanatory proximity.`;
      } else {
        // TIER 5: WEAK — Articles exist, but all are generic market news, portfolio disclosures, or multi-ticker mentions
        status = 'WEAK';
        confidence = 0.15;
        const top = articles[0]!;
        const categoryLabel = top.explanatoryCategory === 'PORTFOLIO_DISCLOSURE'
          ? 'portfolio disclosure'
          : top.explanatoryCategory === 'GENERIC_ROUNDUP'
          ? 'broad market roundup'
          : 'general commentary';
        supporting.push(`Retrieved headline ("${top.headline}") represents a ${categoryLabel} or multi-ticker mention rather than an asset-specific corporate event.`);
        contradicting.push(
          `No asset-specific material event (earnings, SEC filings, executive changes, M&A) identified for ${evidence.symbol}.`,
          `Broad market roundups, politician disclosures, and multi-ticker mentions do not explain idiosyncratic tokenized price dislocation.`
        );
        missing.push(`Asset-specific material corporate event or breaking news for ${evidence.symbol}.`);
        rationale = `Heuristic score 0.15: Retrieved news consists of generic market roundups or portfolio disclosures with zero asset-specific explanatory relevance.`;
      }
    }

    hypotheses.push({
      id: 'MARKET_EVENT',
      title: 'Market Catalyst / Corporate Action',
      description: 'Price disparity driven by corporate actions (earnings, dividends, splits) or fast-breaking market news.',
      supportingEvidence: supporting.length ? supporting : ['No qualifying catalyst evidence identified.'],
      contradictingEvidence: contradicting.length ? contradicting : ['No contra-indicators.'],
      missingEvidence: missing,
      confidenceRationale: rationale,
      confidence,
      status,
    });
  }

  // 6. INSUFFICIENT_EVIDENCE
  {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const missing: string[] = [
      'Synchronized live quotes and orderbook depth from both primary and tokenized venues.',
    ];

    if (evidence.comparisonStatus !== 'AVAILABLE') {
      supporting.push(`Comparison status is ${evidence.comparisonStatus}; dislocation is withheld.`);
    }
    if (evidence.referencePrice === null) {
      supporting.push('Reference price is null or unavailable.');
    }
    if (evidence.tokenizedPrice === null) {
      supporting.push('Tokenized price is null or unavailable.');
    }

    if (evidence.comparisonStatus === 'AVAILABLE' && evidence.dataStatus === 'LIVE') {
      contradicting.push('Both tokenized and reference prices are LIVE, verified, and within synchronization limits.');
    }

    const isSupported = evidence.comparisonStatus !== 'AVAILABLE' || evidence.referencePrice === null || evidence.tokenizedPrice === null;
    const confidence = isSupported ? 0.95 : 0.10;

    hypotheses.push({
      id: 'INSUFFICIENT_EVIDENCE',
      title: 'Insufficient / Withheld Market Data',
      description: 'Current market data or synchronization limits prevent a verified evaluation.',
      supportingEvidence: supporting.length ? supporting : ['Data feeds are verified and available.'],
      contradictingEvidence: contradicting.length ? contradicting : ['Data issues detected.'],
      missingEvidence: missing,
      confidenceRationale: isSupported
        ? `Heuristic score 0.95: Comparison status is ${evidence.comparisonStatus}; market data is insufficient for verified active dislocation.`
        : 'Heuristic score 0.10: Both market feeds are LIVE, verified, and synchronized.',
      confidence,
      status: isSupported ? 'SUPPORTED' : 'WEAK',
    });
  }

  return hypotheses;
}
