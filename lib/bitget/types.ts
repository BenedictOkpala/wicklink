import type { MarketSession } from '../market/session.ts';
import type { SessionResolution } from '../market/resolve-session.ts';
export type DataStatus = 'LIVE' | 'DELAYED' | 'UNAVAILABLE' | 'ERROR';
export interface Instrument { symbol: string; baseCoin: string; quoteCoin: string; status: string; isReality: string }
export interface Ticker { symbol: string; lastPrice: string; ts: string }

export interface FxRate {
  pair: 'USDT/USD';
  rate: number;
  timestamp: string;
  ageMs: number;
  status: DataStatus;
  source: string;
  parityDeltaPercent: number;
}

export interface MarketAsset {
  symbol: string; displayName: string; tokenizedSymbol: string; quoteCurrency: string;
  tokenizedPrice: number | null; referencePrice: number | null; tokenizedTimestamp: string | null;
  referenceTimestamp: string | null; marketSession: MarketSession; rawDislocationPercent: number | null;
  indicativeGapPercent: number | null;
  indicativeGapDirection: 'premium' | 'discount' | 'flat' | null;
  isIndicativeOnly?: boolean;
  fxNormalizedTokenizedPrice?: number | null;
  fxNormalizedDislocationPercent?: number | null;
  sessionSource: string | null; sessionEvaluatedAt: string | null;
  referenceSource: 'Alpaca IEX' | 'Alpaca Overnight Indicative' | null; referenceCurrency: 'USD' | null;
  referenceType: 'TRADE' | 'INDICATIVE_MIDPOINT' | null;
  referenceBid: number | null; referenceAsk: number | null;
  dislocationDirection: 'premium' | 'discount' | 'flat' | null;
  absoluteDifference: number | null; priceDifference: number | null;
  bitgetStatus: DataStatus; referenceStatus: DataStatus;
  comparisonStatus: 'AVAILABLE' | 'STALE' | 'ASYNCHRONOUS' | 'UNAVAILABLE' | 'ERROR';
  tokenizedAgeMs: number | null; referenceAgeMs: number | null; timestampSkewMs: number | null;
  comparisonAsOf: string | null;
  dataStatus: DataStatus; issue: string | null;
}
export interface MarketResponse {
  sessionIssue?: string;
  sessionDiagnostics?: SessionResolution;
  fxRate?: FxRate | null;
  assets: MarketAsset[]; fetchedAt: string; dataStatus: DataStatus;
  referenceAvailable: boolean; message: string; events: { timestamp: string; message: string }[];
}
