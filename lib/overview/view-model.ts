import type { MarketAsset } from '../bitget/types.ts';
import type { MarketSession } from '../market/session.ts';
import { formatAge } from '../market/presentation.ts';
import { isSupportedSymbol } from '../investigation/symbols.ts';
import { INVESTIGATION_POLICY } from '../investigation/policy.ts';
import { rankOverviewCandidates } from './ranking.ts';
import type { Caution, Direction, OverviewAsset, OverviewComparison, OverviewInput, OverviewViewModel } from './types.ts';

const contexts: Record<MarketSession, string> = {
  REGULAR: 'Regular US reference session',
  PRE_MARKET: 'Pre-market reference context',
  AFTER_HOURS: 'After-hours reference context',
  OVERNIGHT: 'Overnight reference context · indicative quote midpoints',
  CLOSED: 'US reference market closed · last available reference context',
  UNKNOWN: 'US reference session unknown · comparisons withheld',
};
const withheld: OverviewComparison = { kind: 'WITHHELD', percent: null, direction: null };
const positive = (value: number | null) => value !== null && Number.isFinite(value) && value > 0;
const validAge = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0;
const validTime = (value: string | null) => value !== null && Number.isFinite(Date.parse(value));

function validDifference(percent: number | null, direction: Direction | null): percent is number {
  return percent !== null && Number.isFinite(percent)
    && direction === (percent > 0 ? 'premium' : percent < 0 ? 'discount' : 'flat');
}

function comparisonFor(asset: MarketAsset, session: MarketSession): OverviewComparison {
  // These are contract consistency guards, not another price/session/freshness engine.
  if (session === 'UNKNOWN' || asset.marketSession !== session
    || !positive(asset.tokenizedPrice) || !positive(asset.referencePrice)
    || !validAge(asset.tokenizedAgeMs) || !validAge(asset.referenceAgeMs)
    || !validTime(asset.tokenizedTimestamp) || !validTime(asset.referenceTimestamp)
    || !asset.referenceSource || !asset.referenceType
    || [asset.dataStatus, asset.bitgetStatus, asset.referenceStatus].some(status => status === 'ERROR' || status === 'UNAVAILABLE')) return { ...withheld };

  if (asset.comparisonStatus === 'AVAILABLE' && !asset.isIndicativeOnly
    && (session === 'REGULAR' || session === 'OVERNIGHT')
    && asset.dataStatus === 'LIVE' && asset.bitgetStatus === 'LIVE' && asset.referenceStatus === 'LIVE'
    && validDifference(asset.rawDislocationPercent, asset.dislocationDirection)) {
    return { kind: 'LIVE', percent: asset.rawDislocationPercent, direction: asset.dislocationDirection! };
  }
  if ((asset.comparisonStatus === 'STALE' || asset.comparisonStatus === 'ASYNCHRONOUS')
    && asset.isIndicativeOnly === true && asset.rawDislocationPercent === null
    && validDifference(asset.indicativeGapPercent, asset.indicativeGapDirection)) {
    return { kind: 'INDICATIVE', percent: asset.indicativeGapPercent, direction: asset.indicativeGapDirection! };
  }
  return { ...withheld };
}

function differenceText(comparison: OverviewComparison): string {
  if (comparison.kind === 'WITHHELD') return 'Comparison withheld';
  if (comparison.direction === 'flat') return 'Aligned with reference';
  const magnitude = Math.abs(comparison.percent);
  const amount = magnitude < 0.0001 ? '<0.0001' : magnitude.toFixed(magnitude < 0.1 ? 4 : 2);
  return `${amount}% ${comparison.direction === 'premium' ? 'above' : 'below'} reference`;
}

/** Pure projection: no clock, fetching, AI, price arithmetic, or input mutation. */
export function toOverviewAsset(asset: MarketAsset, marketSession: MarketSession): OverviewAsset {
  const comparison = comparisonFor(asset, marketSession);
  const cautions: Caution[] = [];
  if (marketSession === 'UNKNOWN') cautions.push('UNKNOWN_SESSION');
  if (asset.marketSession !== marketSession) cautions.push('SESSION_MISMATCH');
  if (comparison.kind === 'WITHHELD') cautions.push('COMPARISON_WITHHELD');
  if (asset.comparisonStatus === 'STALE' || asset.bitgetStatus === 'DELAYED' || asset.referenceStatus === 'DELAYED') cautions.push('STALE_OBSERVATION');
  if (asset.comparisonStatus === 'ASYNCHRONOUS') cautions.push('TIMESTAMP_MISMATCH');
  if ([asset.dataStatus, asset.bitgetStatus, asset.referenceStatus].includes('ERROR')) cautions.push('PROVIDER_ERROR');
  if (!asset.referenceSource || !asset.referenceType || !validTime(asset.referenceTimestamp)) cautions.push('REFERENCE_PROVENANCE_MISSING');
  if (asset.referenceSource === 'Alpaca IEX') cautions.push('SINGLE_EXCHANGE_REFERENCE');
  if (asset.referenceType === 'INDICATIVE_MIDPOINT') cautions.push('INDICATIVE_MIDPOINT');
  if (comparison.kind === 'INDICATIVE') cautions.push('INDICATIVE_COMPARISON');
  if (asset.quoteCurrency !== asset.referenceCurrency) cautions.push('CURRENCY_BASIS');
  const investigationAvailable = isSupportedSymbol(asset.symbol);
  const context = comparison.kind === 'INDICATIVE'
    ? `Indicative comparison · reference ${formatAge(asset.referenceAgeMs)} · ${differenceText(comparison)}`
    : marketSession === 'UNKNOWN' ? contexts.UNKNOWN : differenceText(comparison);
  return {
    symbol: asset.symbol, displayName: asset.displayName, tokenizedSymbol: asset.tokenizedSymbol,
    tokenizedPrice: asset.tokenizedPrice, referencePrice: asset.referencePrice,
    quoteCurrency: asset.quoteCurrency, referenceCurrency: asset.referenceCurrency,
    marketSession: asset.marketSession, comparisonStatus: asset.comparisonStatus,
    dataStatus: asset.dataStatus, bitgetStatus: asset.bitgetStatus, referenceStatus: asset.referenceStatus,
    comparison, context,
    worthWatching: comparison.kind === 'LIVE' && Math.abs(comparison.percent) >= INVESTIGATION_POLICY.DISLOCATION.MINIMAL_THRESHOLD_PERCENT,
    investigationAvailable, investigationUnavailableReason: investigationAvailable ? null : 'Symbol is not supported by the investigation API.',
    referenceSource: asset.referenceSource, referenceType: asset.referenceType,
    referenceBid: asset.referenceBid, referenceAsk: asset.referenceAsk,
    tokenizedTimestamp: asset.tokenizedTimestamp, referenceTimestamp: asset.referenceTimestamp,
    tokenizedAgeMs: asset.tokenizedAgeMs, referenceAgeMs: asset.referenceAgeMs, timestampSkewMs: asset.timestampSkewMs,
    comparisonAsOf: asset.comparisonAsOf, requiresCaution: cautions.length > 0, cautions, issue: asset.issue,
  };
}

export function buildOverviewViewModel(input: OverviewInput): OverviewViewModel {
  const limit = input.limit ?? 5;
  const surveillance = {
    fetchedAt: input.surveillance?.fetchedAt ?? null,
    snapshotAgeMs: input.surveillance?.snapshotAgeMs ?? null,
    refreshing: input.surveillance?.refreshing ?? false,
    connection: input.surveillance?.connection ?? 'UNKNOWN',
  };
  const projected = input.assets.map(asset => toOverviewAsset(asset, input.marketSession));
  // On a known connection failure, retain the monitored count but hide cached candidates.
  const eligible = surveillance.connection === 'ERROR' ? [] : projected;
  const liveCandidates = rankOverviewCandidates(eligible, 'LIVE', limit);
  const offHours = input.marketSession !== 'REGULAR' && input.marketSession !== 'UNKNOWN';
  const indicativeCandidates = offHours ? rankOverviewCandidates(eligible, 'INDICATIVE', limit) : [];
  const selectedGroup = liveCandidates.length ? 'LIVE' : indicativeCandidates.length ? 'INDICATIVE' : 'NONE';
  return {
    marketSession: input.marketSession, mode: input.marketSession, context: contexts[input.marketSession],
    surveillance, totalMonitoredAssetCount: input.assets.length,
    counts: {
      live: eligible.filter(asset => asset.comparison.kind === 'LIVE').length,
      indicative: eligible.filter(asset => asset.comparison.kind === 'INDICATIVE').length,
      withheld: surveillance.connection === 'ERROR' ? projected.length : projected.filter(asset => asset.comparison.kind === 'WITHHELD').length,
      worthWatching: eligible.filter(asset => asset.worthWatching).length,
    },
    liveCandidates, indicativeCandidates, selectedGroup,
    displayedAssets: selectedGroup === 'LIVE' ? liveCandidates : selectedGroup === 'INDICATIVE' ? indicativeCandidates : [], limit,
  };
}
