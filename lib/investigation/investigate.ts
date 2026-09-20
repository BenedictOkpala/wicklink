import 'server-only';
import { collectMarketEvidence } from './evidence.ts';
import { isSupportedSymbol } from './symbols.ts';
import { deriveDeterministicSignals } from './signals.ts';
import { evaluateHypotheses } from './hypotheses.ts';
import { calculateDataQualityScore } from './quality.ts';
import { runAiInvestigation } from '../ai/provider.ts';
import type { InvestigationAssessment, InvestigationReport } from './types.ts';

export async function executeInvestigation(rawSymbol: string): Promise<InvestigationReport> {
  const startedAt = Date.now();
  const requestedAt = new Date(startedAt).toISOString();
  const symbol = rawSymbol.trim().toUpperCase();

  if (!isSupportedSymbol(symbol)) {
    throw new Error(`Symbol '${rawSymbol}' is not a supported Reality instrument.`);
  }

  // 1. Gather fresh factual market evidence (deterministic)
  const evidence = await collectMarketEvidence(symbol);

  // 2. Derive deterministic signals from evidence
  const signals = deriveDeterministicSignals(evidence);

  // 3. Compute deterministic Data Quality Score (independent of AI)
  const dataQuality = calculateDataQualityScore(evidence);

  // 4. Formulate baseline hypothesis evidence matrix (deterministic)
  const baselineHypotheses = evaluateHypotheses(evidence);

  // 5. Compute closed-market intelligence callout and deterministic "Why This Matters"
  const isOffHours = evidence.marketSession === 'CLOSED' || evidence.marketSession === 'OVERNIGHT';
  const closedMarketCallout = isOffHours
    ? "Wall Street closed. Price discovery didn't. Continuous equity cash auctions are inactive while tokenized venues trade 24/7."
    : null;

  const topHypothesis = [...baselineHypotheses].sort((a, b) => b.confidence - a.confidence)[0];
  const dislocationStr = evidence.rawDislocationPercent !== null
    ? `${evidence.rawDislocationPercent > 0 ? '+' : ''}${evidence.rawDislocationPercent.toFixed(4)}%`
    : 'withheld';

  let deterministicWhyThisMatters = '';
  if (isOffHours) {
    deterministicWhyThisMatters = `${symbol} surfaced due to 24/7 off-hours price discovery on Bitget while primary US equity cash auctions are inactive.`;
  } else if (evidence.rawDislocationPercent !== null && Math.abs(evidence.rawDislocationPercent) >= 0.25) {
    deterministicWhyThisMatters = `${symbol} surfaced with an active dislocation of ${dislocationStr}, exceeding standard liquidity spread thresholds.`;
  } else if (evidence.bitgetSpreadPercent !== null && evidence.bitgetSpreadPercent > 0.1) {
    deterministicWhyThisMatters = `${symbol} surfaced due to elevated quoting spread (${evidence.bitgetSpreadPercent.toFixed(3)}%) on the tokenized order book relative to reference.`;
  } else {
    deterministicWhyThisMatters = `${symbol} is monitored under standard research surveillance with ${evidence.marketSession} session reference alignment.`;
  }

  // 6. Run AI investigation independently (fast timeout, server-side only)
  const aiResult = await runAiInvestigation({
    evidence,
    signals,
    hypotheses: baselineHypotheses,
  });

  let assessment: InvestigationAssessment | null = null;
  let finalHypotheses = baselineHypotheses;

  if (aiResult.status === 'COMPLETED' && aiResult.output) {
    assessment = {
      ...aiResult.output.assessment,
      whyThisMatters: aiResult.output.assessment.whyThisMatters || deterministicWhyThisMatters,
      closedMarketCallout,
    };
    if (aiResult.output.hypotheses.length > 0) {
      finalHypotheses = aiResult.output.hypotheses.map(aiH => {
        const baseline = baselineHypotheses.find(b => b.id === aiH.id);
        return {
          ...aiH,
          missingEvidence: aiH.missingEvidence ?? baseline?.missingEvidence ?? [],
          confidenceRationale: aiH.confidenceRationale ?? baseline?.confidenceRationale ?? '',
        };
      });
    }
  } else {
    // Deterministic fallback assessment: synthesizes findings from rule-based signals and heuristics
    let fallbackVerdict: InvestigationAssessment['dislocationVerdict'] = 'MARKET_STRUCTURE_EFFECT';
    if (evidence.comparisonStatus !== 'AVAILABLE') {
      fallbackVerdict = 'INSUFFICIENT_DATA';
    } else if (evidence.timestampSkewMs !== null && evidence.timestampSkewMs > 15000) {
      fallbackVerdict = 'DATA_LATENCY_ARTIFACT';
    } else if (Math.abs(evidence.rawDislocationPercent ?? 0) > 0.25) {
      fallbackVerdict = 'MEANINGFUL_DISLOCATION';
    }

    const catalystRisks: string[] = [];
    if (evidence.catalyst?.status === 'AVAILABLE' && evidence.catalyst.articles.length > 0) {
      catalystRisks.push('Contemporaneous news may not imply direct causation of tokenized spread.');
    } else if (evidence.catalyst?.status === 'UNCONFIGURED') {
      catalystRisks.push('Catalyst news credentials unconfigured; hypothesis evaluated without live news feed.');
    } else {
      catalystRisks.push('No qualifying market catalyst or corporate action detected in 48h search window.');
    }

    // Reflect catalyst classifier in Key Evidence: only present headline if a sufficiently relevant asset-specific catalyst was identified
    const materialArticle = evidence.catalyst?.articles.find(
      a => (a.isMaterialCatalyst && (a.temporalRelevance === 'BREAKING' || a.temporalRelevance === 'RECENT')) ||
           (a.assetRelevance === 'PRIMARY_FOCUS' && a.temporalRelevance === 'BREAKING' && a.explanatoryCategory === 'ANALYST_OR_PRODUCT')
    );

    const catalystEvidencePoint = materialArticle
      ? `Catalyst: [${materialArticle.source}] "${materialArticle.headline}" (${materialArticle.relevance})`
      : 'Catalyst: No material asset-specific catalyst identified.';

    assessment = {
      summary: `Deterministic review for ${symbol}: Observed dislocation of ${dislocationStr} under US ${evidence.marketSession} session rules. Most active signal: ${topHypothesis?.title ?? 'None'}.`,
      primaryExplanation: topHypothesis ? `${topHypothesis.title}: ${topHypothesis.supportingEvidence[0] ?? topHypothesis.description}` : 'Pending data resolution.',
      whyThisMatters: deterministicWhyThisMatters,
      closedMarketCallout,
      dislocationVerdict: fallbackVerdict,
      keyRisks: [
        'Raw USDT-vs-USD comparison without currency basis adjustment.',
        'Market liquidity on tokenized venue may differ from continuous equity auction.',
        ...catalystRisks,
      ],
      keyEvidencePoints: [
        ...signals.map(s => `${s.name}: ${s.value}`),
        catalystEvidencePoint,
      ],
      limitations: evidence.limitations,
    };
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  return {
    id: `inv-${symbol.toLowerCase()}-${startedAt}`,
    symbol,
    tokenizedSymbol: evidence.tokenizedSymbol,
    requestedAt,
    completedAt,
    durationMs,
    evidence,
    signals,
    dataQuality,
    hypotheses: finalHypotheses,
    assessment,
    aiStatus: aiResult.status,
    aiIssue: aiResult.issue,
    limitations: evidence.limitations,
  };
}
