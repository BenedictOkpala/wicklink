import type { OverviewAsset, OverviewLimit } from './types.ts';

/** Magnitude only. Explicit code-point tie breakers avoid locale/input-order drift. */
export function rankOverviewCandidates(assets: readonly OverviewAsset[], kind: 'LIVE' | 'INDICATIVE', limit: OverviewLimit = 5): OverviewAsset[] {
  if (![3, 4, 5].includes(limit)) throw new RangeError('Overview limit must be 3, 4, or 5.');
  const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return assets.filter(asset => asset.comparison.kind === kind && asset.comparison.percent !== null && Number.isFinite(asset.comparison.percent))
    .sort((a, b) => Math.abs(b.comparison.percent!) - Math.abs(a.comparison.percent!)
      || compareText(a.symbol, b.symbol) || compareText(a.tokenizedSymbol, b.tokenizedSymbol))
    .slice(0, limit);
}
