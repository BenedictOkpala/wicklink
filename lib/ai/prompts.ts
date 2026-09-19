import type { AiInvestigationInput } from './types.ts';

export const SYSTEM_PROMPT = `You are WickLink Research Desk, an objective financial intelligence analyst specializing in tokenized US equities on Bitget and their underlying US market references.

Your role is to investigate why a price dislocation exists between a tokenized equity and its reference market based SOLELY on the supplied structured evidence and deterministic signals.

STRICT OPERATIONAL CONSTRAINTS:
1. DO NOT generate trade signals, buy/sell/hold recommendations, target prices, or position sizing advice. This is a read-only research intelligence tool.
2. DO NOT calculate raw numbers or percentages yourself. Rely strictly on the supplied mathematical evidence.
3. DO NOT invent, assume, or hallucinate external events, earnings reports, breaking news, company announcements, headlines, or market catalysts. Only refer to news articles explicitly supplied in the structured catalystEvidence object. If catalystEvidence is empty, unconfigured, or dated, the MARKET_EVENT hypothesis cannot be asserted as primary without verified contemporaneous news.
4. DO NOT convert correlation to causation: A news event appearing near a dislocation does not automatically prove it caused the dislocation. Note catalyst timing, explanatory category (e.g. material corporate event vs generic roundup vs portfolio disclosure), and whether other hypotheses (e.g. illiquid book, off-hours trading) sufficiently account for the spread. Any discussion of whether retrieved news is relevant MUST be explicitly framed as an unproven interpretation and cannot convert temporal correlation into proven causation.
5. Compare competing hypotheses critically:
   - Identify which explanations are supported or contradicted by the evidence.
   - Distinguish between a genuine economic dislocation vs. an artifact of market structure, trading session boundaries (e.g. overnight indicative quote vs cash continuous auction), or observation latency.
6. DO NOT expose hidden chain-of-thought, internal prompting, or private reasoning.
7. Return ONLY a valid JSON object matching the requested schema.`;

export function buildUserPrompt(input: AiInvestigationInput): string {
  const { evidence, signals, hypotheses } = input;

  const payload = {
    asset: {
      symbol: evidence.symbol,
      tokenizedSymbol: evidence.tokenizedSymbol,
      name: evidence.displayName,
    },
    marketObservations: {
      tokenizedPrice: evidence.tokenizedPrice,
      tokenizedQuote: evidence.quoteCurrency,
      referencePrice: evidence.referencePrice,
      referenceCurrency: evidence.referenceCurrency,
      rawDislocationPercent: evidence.rawDislocationPercent,
      dislocationDirection: evidence.dislocationDirection,
      absoluteDifference: evidence.absoluteDifference,
    },
    timingAndFreshness: {
      tokenizedAgeMs: evidence.tokenizedAgeMs,
      referenceAgeMs: evidence.referenceAgeMs,
      timestampSkewMs: evidence.timestampSkewMs,
      marketSession: evidence.marketSession,
      sessionSource: evidence.sessionSource,
      comparisonStatus: evidence.comparisonStatus,
    },
    marketMicrostructure: {
      bitgetSpreadPercent: evidence.bitgetSpreadPercent,
      bitgetBid1: evidence.bitgetBid1Price,
      bitgetAsk1: evidence.bitgetAsk1Price,
      bitgetBid1Size: evidence.bitgetBid1Size,
      bitgetAsk1Size: evidence.bitgetAsk1Size,
      volume24h: evidence.bitgetVolume24h,
      turnover24h: evidence.bitgetTurnover24h,
      priceChange24hPcnt: evidence.bitgetPriceChange24hPcnt,
      referenceSource: evidence.referenceSource,
      referenceType: evidence.referenceType,
      referenceSpreadPercent: evidence.referenceSpreadPercent,
      orderbookAvailable: evidence.orderbook !== null,
    },
    catalystEvidence: evidence.catalyst ? {
      status: evidence.catalyst.status,
      provider: evidence.catalyst.provider,
      searchedAt: evidence.catalyst.searchedAt,
      windowHours: evidence.catalyst.windowHours,
      breakingCount: evidence.catalyst.breakingCount,
      recentCount: evidence.catalyst.recentCount,
      materialCount: evidence.catalyst.materialCount,
      articles: evidence.catalyst.articles.map(a => ({
        headline: a.headline,
        source: a.source,
        publishedAt: a.publishedAt,
        temporalRelevance: a.temporalRelevance,
        assetRelevance: a.assetRelevance,
        explanatoryCategory: a.explanatoryCategory,
        isMaterialCatalyst: a.isMaterialCatalyst,
        ageRelativeMinutes: Math.round(a.ageRelativeMs / 60000),
        summary: a.summary,
      })),
    } : null,
    recordedLimitations: evidence.limitations,
    deterministicSignals: signals.map(s => ({
      id: s.id,
      name: s.name,
      value: s.value,
      interpretation: s.interpretation,
      severity: s.severity,
    })),
    baselineHypotheses: hypotheses.map(h => ({
      id: h.id,
      title: h.title,
      currentStatus: h.status,
      confidence: h.confidence,
      supporting: h.supportingEvidence,
      contradicting: h.contradictingEvidence,
    })),
  };

  return `Investigate the following observed price dislocation and produce an objective research assessment:

${JSON.stringify(payload, null, 2)}

Respond with a JSON object containing:
{
  "assessment": {
    "summary": "2-3 sentence executive synthesis of the finding.",
    "primaryExplanation": "The single most probable explanation based strictly on the evidence.",
    "dislocationVerdict": "MEANINGFUL_DISLOCATION" | "MARKET_STRUCTURE_EFFECT" | "DATA_LATENCY_ARTIFACT" | "INSUFFICIENT_DATA",
    "keyRisks": ["Risk point 1", "Risk point 2"],
    "keyEvidencePoints": ["Evidence point 1", "Evidence point 2"],
    "limitations": ["Data limitation 1"]
  },
  "hypotheses": [
    {
      "id": "LIQUIDITY_IMBALANCE" | "OFF_HOURS_PRICE_DISCOVERY" | "REFERENCE_LAG" | "TOKENIZED_MARKET_LAG" | "MARKET_EVENT" | "INSUFFICIENT_EVIDENCE",
      "title": "Hypothesis title",
      "description": "Brief description",
      "supportingEvidence": ["point 1"],
      "contradictingEvidence": ["point 1"],
      "confidence": 0.0 to 1.0,
      "status": "SUPPORTED" | "PLAUSIBLE" | "WEAK" | "UNRESOLVED"
    }
  ]
}`;
}
