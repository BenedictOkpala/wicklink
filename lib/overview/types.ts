import type { DataStatus, MarketAsset } from '../bitget/types.ts';
import type { MarketSession } from '../market/session.ts';

export type OverviewMode = 'REGULAR' | 'PRE_MARKET' | 'AFTER_HOURS' | 'OVERNIGHT' | 'CLOSED' | 'UNKNOWN';
export type OverviewLimit = 3 | 4 | 5;
export type Direction = 'premium' | 'discount' | 'flat';
export type OverviewComparison =
  | { kind: 'LIVE' | 'INDICATIVE'; percent: number; direction: Direction }
  | { kind: 'WITHHELD'; percent: null; direction: null };
export type Caution =
  | 'UNKNOWN_SESSION' | 'SESSION_MISMATCH' | 'COMPARISON_WITHHELD'
  | 'STALE_OBSERVATION' | 'TIMESTAMP_MISMATCH' | 'PROVIDER_ERROR'
  | 'REFERENCE_PROVENANCE_MISSING' | 'SINGLE_EXCHANGE_REFERENCE'
  | 'INDICATIVE_MIDPOINT' | 'INDICATIVE_COMPARISON' | 'CURRENCY_BASIS';

export interface OverviewAsset {
  symbol: string;
  displayName: string;
  tokenizedSymbol: string;
  tokenizedPrice: number | null;
  referencePrice: number | null;
  quoteCurrency: string;
  referenceCurrency: MarketAsset['referenceCurrency'];
  marketSession: MarketSession;
  comparisonStatus: MarketAsset['comparisonStatus'];
  dataStatus: DataStatus;
  bitgetStatus: DataStatus;
  referenceStatus: DataStatus;
  comparison: OverviewComparison;
  context: string;
  worthWatching: boolean;
  investigationAvailable: boolean;
  investigationUnavailableReason: string | null;
  referenceSource: MarketAsset['referenceSource'];
  referenceType: MarketAsset['referenceType'];
  referenceBid: number | null;
  referenceAsk: number | null;
  tokenizedTimestamp: string | null;
  referenceTimestamp: string | null;
  tokenizedAgeMs: number | null;
  referenceAgeMs: number | null;
  timestampSkewMs: number | null;
  comparisonAsOf: string | null;
  requiresCaution: boolean;
  cautions: Caution[];
  issue: string | null;
}

export interface SurveillanceContext {
  fetchedAt: string | null;
  /** Snapshot age supplied by the caller; never presented as provider freshness. */
  snapshotAgeMs: number | null;
  refreshing: boolean;
  connection: 'CONNECTED' | 'ERROR' | 'UNKNOWN';
}

export interface OverviewInput {
  /** Already normalized and freshness-adjusted using the canonical pipeline. */
  assets: readonly MarketAsset[];
  marketSession: MarketSession;
  limit?: OverviewLimit;
  surveillance?: Partial<SurveillanceContext>;
}

export interface OverviewViewModel {
  marketSession: MarketSession;
  mode: OverviewMode;
  context: string;
  surveillance: SurveillanceContext;
  totalMonitoredAssetCount: number;
  counts: { live: number; indicative: number; withheld: number; worthWatching: number };
  /** Separate rankings. Never concatenate these into one evidentiary ranking. */
  liveCandidates: OverviewAsset[];
  indicativeCandidates: OverviewAsset[];
  selectedGroup: 'LIVE' | 'INDICATIVE' | 'NONE';
  /** At most limit items from one group; never padded with weaker candidates. */
  displayedAssets: OverviewAsset[];
  limit: OverviewLimit;
}
