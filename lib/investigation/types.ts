import type { DataStatus } from '../bitget/types.ts';
import type { MarketSession } from '../market/session.ts';
import type { CatalystEvidence } from '../catalyst/types.ts';

export interface InvestigationRequest {
  symbol: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookSnapshot {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: string | null;
  spreadAmount: number | null;
  spreadPercent: number | null;
}

export interface InvestigationEvidence {
  // Core asset identification
  symbol: string;
  displayName: string;
  tokenizedSymbol: string;
  quoteCurrency: string;
  referenceCurrency: string;

  // Prices & dislocation metrics
  tokenizedPrice: number | null;
  referencePrice: number | null;
  rawDislocationPercent: number | null;
  dislocationDirection: 'premium' | 'discount' | 'flat' | null;
  indicativeGapPercent?: number | null;
  indicativeGapDirection?: 'premium' | 'discount' | 'flat' | null;
  isIndicativeOnly?: boolean;
  fxNormalizedTokenizedPrice?: number | null;
  fxNormalizedDislocationPercent?: number | null;
  absoluteDifference: number | null;
  priceDifference: number | null;

  // Timestamps & timing analysis
  tokenizedTimestamp: string | null;
  referenceTimestamp: string | null;
  tokenizedAgeMs: number | null;
  referenceAgeMs: number | null;
  timestampSkewMs: number | null;

  // Market session context
  marketSession: MarketSession;
  sessionSource: string | null;
  sessionDiagnostic: string | null;

  // Verification states
  comparisonStatus: 'AVAILABLE' | 'STALE' | 'ASYNCHRONOUS' | 'UNAVAILABLE' | 'ERROR';
  dataStatus: DataStatus;
  bitgetStatus: DataStatus;
  referenceStatus: DataStatus;

  // Reference provider specifics
  referenceSource: string | null;
  referenceType: 'TRADE' | 'INDICATIVE_MIDPOINT' | null;
  referenceBid: number | null;
  referenceAsk: number | null;
  referenceSpreadPercent: number | null;

  // Additional public Bitget market evidence
  bitgetBid1Price: number | null;
  bitgetAsk1Price: number | null;
  bitgetBid1Size: number | null;
  bitgetAsk1Size: number | null;
  bitgetSpreadAmount: number | null;
  bitgetSpreadPercent: number | null;
  bitgetVolume24h: number | null;
  bitgetTurnover24h: number | null;
  bitgetHigh24h: number | null;
  bitgetLow24h: number | null;
  bitgetPriceChange24hPcnt: number | null;

  // Public top-of-book orderbook snapshot (if accessible)
  orderbook: OrderbookSnapshot | null;

  // Real news and market catalyst evidence
  catalyst: CatalystEvidence;

  // Recorded factual limitations and structural caveats
  limitations: string[];
}

export type SignalSeverity = 'INFO' | 'WARNING' | 'ALERT';

export type SignalId =
  | 'DISLOCATION_MAGNITUDE'
  | 'REFERENCE_FRESHNESS'
  | 'TOKENIZED_FRESHNESS'
  | 'TIMESTAMP_ALIGNMENT'
  | 'MARKET_SESSION_CONTEXT'
  | 'LIQUIDITY_CONTEXT';

export interface InvestigationSignal {
  id: SignalId;
  name: string;
  category: 'PRICING' | 'SYNCHRONIZATION' | 'SESSION' | 'LIQUIDITY';
  value: string;
  numericValue: number | null;
  interpretation: string;
  severity: SignalSeverity;
}

export type HypothesisId =
  | 'LIQUIDITY_IMBALANCE'
  | 'OFF_HOURS_PRICE_DISCOVERY'
  | 'REFERENCE_LAG'
  | 'TOKENIZED_MARKET_LAG'
  | 'MARKET_EVENT'
  | 'INSUFFICIENT_EVIDENCE';

export type HypothesisStatus = 'SUPPORTED' | 'PLAUSIBLE' | 'WEAK' | 'UNRESOLVED';

export interface InvestigationHypothesis {
  id: HypothesisId;
  title: string;
  description: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence?: string[];
  confidenceRationale?: string;
  confidence: number; // 0.0 - 1.0 heuristic score
  status: HypothesisStatus;
}

export type DislocationVerdict =
  | 'MEANINGFUL_DISLOCATION'
  | 'MARKET_STRUCTURE_EFFECT'
  | 'DATA_LATENCY_ARTIFACT'
  | 'INSUFFICIENT_DATA';

export interface InvestigationAssessment {
  summary: string;
  primaryExplanation: string;
  dislocationVerdict: DislocationVerdict;
  keyRisks: string[];
  keyEvidencePoints: string[];
  limitations: string[];
}

export type AiAnalysisStatus = 'COMPLETED' | 'AI_ANALYSIS_UNAVAILABLE' | 'FAILED';

export interface InvestigationReport {
  id: string;
  symbol: string;
  tokenizedSymbol: string;
  requestedAt: string;
  completedAt: string;
  durationMs: number;
  evidence: InvestigationEvidence;
  signals: InvestigationSignal[];
  hypotheses: InvestigationHypothesis[];
  assessment: InvestigationAssessment | null;
  aiStatus: AiAnalysisStatus;
  aiIssue: string | null;
  limitations: string[];
}
