import type { DataStatus, MarketAsset } from '../lib/bitget/types.ts';

export function displayPercent(value: number | null) {
  if (value === null) return '—';
  if (value === 0) return '0.00%';
  const sign = value > 0 ? '+' : '−';
  const absolute = Math.abs(value);
  if (absolute < 0.0001) return `${sign}<0.0001%`;
  return `${sign}${absolute.toFixed(absolute < 0.1 ? 4 : 2)}%`;
}

export function aggregateStatus(values: DataStatus[]): DataStatus {
  if (!values.length) return 'UNAVAILABLE';
  for (const status of ['ERROR', 'UNAVAILABLE', 'DELAYED'] as const) if (values.includes(status)) return status;
  return 'LIVE';
}

export function providerStatus(assets: MarketAsset[], provider: 'bitget' | 'reference', failed: boolean) {
  return failed ? 'ERROR' : aggregateStatus(assets.map(asset => provider === 'bitget' ? asset.bitgetStatus : asset.referenceStatus));
}

export function timeLabel(timestamp: string | null | undefined) {
  return timestamp ? `${timestamp.slice(11, 19)} UTC` : 'Not available';
}

export function sessionLabel(session: string | undefined) {
  return session ? session.replaceAll('_', ' ') : 'UNKNOWN';
}
