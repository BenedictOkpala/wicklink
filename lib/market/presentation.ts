import type { MarketAsset } from '../bitget/types.ts';
import { ageInMilliseconds, MAX_PRICE_AGE_MS } from './policy.ts';

export function ageAsset(asset: MarketAsset, now: number): MarketAsset {
  const tokenizedAgeMs = ageInMilliseconds(asset.tokenizedTimestamp, now);
  const referenceAgeMs = ageInMilliseconds(asset.referenceTimestamp, now);
  const bitgetStatus = asset.bitgetStatus === 'LIVE' && tokenizedAgeMs !== null && tokenizedAgeMs > MAX_PRICE_AGE_MS ? 'DELAYED' : asset.bitgetStatus;
  const referenceStatus = asset.referenceStatus === 'LIVE' && referenceAgeMs !== null && referenceAgeMs > MAX_PRICE_AGE_MS ? 'DELAYED' : asset.referenceStatus;
  const expired = asset.comparisonStatus === 'AVAILABLE' && (tokenizedAgeMs === null || referenceAgeMs === null || tokenizedAgeMs > MAX_PRICE_AGE_MS || referenceAgeMs > MAX_PRICE_AGE_MS);
  return { ...asset, tokenizedAgeMs, referenceAgeMs, bitgetStatus, referenceStatus,
    ...(expired ? { comparisonStatus: 'STALE', dataStatus: 'DELAYED', rawDislocationPercent: null, absoluteDifference: null, priceDifference: null, dislocationDirection: null, issue: 'Comparison withheld: a provider price is stale.' } as const : {}) };
}

export function formatAge(age: number | null) {
  if (age === null) return 'Unknown age';
  if (age < 60000) return `${Math.floor(age / 1000)}s old`;
  if (age < 3600000) return `${Math.floor(age / 60000)}m old`;
  return `${(age / 3600000).toFixed(1)}h old`;
}

export function formatPrice(price: number | null) {
  return price === null ? '—' : price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatPercent(value: number | null) {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
