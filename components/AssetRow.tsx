'use client';

import type { MarketAsset } from '@/lib/bitget/types';
import { formatPrice } from '@/lib/market/presentation';
import { displayPercent } from './ui-format';
import { useValueFlash } from './useValueFlash';
import InterfaceIcon from './InterfaceIcon';
import MiniSparkline from './MiniSparkline';

export default function AssetRow({
  asset,
  selected,
  onSelect,
  onInvestigate,
  sparkline,
  sparklineLoading,
  viewMode = 'screener',
}: {
  asset: MarketAsset;
  selected: boolean;
  onSelect: () => void;
  onInvestigate?: (symbol: string) => void;
  sparkline?: number[] | null;
  sparklineLoading?: boolean;
  viewMode?: 'screener' | 'surveillance';
}) {
  const isStale = asset.comparisonStatus === 'STALE' || asset.isIndicativeOnly;
  const isAvailable = asset.comparisonStatus === 'AVAILABLE';
  const displayDiff = isAvailable ? asset.rawDislocationPercent : asset.indicativeGapPercent;
  const subtle = displayDiff !== null && Math.abs(displayDiff) < 0.1;
  const isPositive = (displayDiff ?? 0) > 0;
  const isNegative = (displayDiff ?? 0) < 0;

  const tokenizedFlash = useValueFlash(asset.symbol, asset.tokenizedPrice, formatPrice);
  const referenceFlash = useValueFlash(asset.symbol, asset.referencePrice, formatPrice);
  const diffFlash = useValueFlash(asset.symbol, displayDiff, displayPercent);
  const hasRowUpdate = tokenizedFlash !== null || referenceFlash !== null || diffFlash !== null;

  return (
    <tr
      className={`market-row ${selected ? 'selected-asset' : ''} ${hasRowUpdate ? 'row-updated' : ''}`}
      onClick={onSelect}
    >
      {/* ASSET */}
      <td className="asset-cell">
        <div className="asset-identity">
          <span className={`asset-monogram monogram-${asset.symbol.toLowerCase()}`}>
            {asset.symbol.slice(0, 1)}
          </span>
          <div className="asset-names">
            <button
              className="asset-select"
              aria-pressed={selected}
              aria-controls="asset-detail"
              onClick={event => {
                event.stopPropagation();
                onSelect();
              }}
            >
              {asset.symbol}
              <span className="sr-only"> details</span>
            </button>
            <span className="secondary">{asset.displayName}</span>
          </div>
        </div>
      </td>

      {/* TOKENIZED PRICE */}
      <td className="tokenized-cell">
        <span className="mobile-label">TOKENIZED PRICE</span>
        <div className="price-sparkline-row">
          <div className="price-num-stack">
            <strong className={`price-value ${tokenizedFlash ? `val-flash-${tokenizedFlash}` : ''}`}>${formatPrice(asset.tokenizedPrice)}</strong>
            <span className="secondary">USDT</span>
          </div>
          <MiniSparkline symbol={asset.symbol} points={sparkline} loading={sparklineLoading} />
        </div>
      </td>

      {/* REFERENCE PRICE */}
      <td className="reference-cell">
        <span className="mobile-label">REFERENCE PRICE</span>
        <strong className={`price-value ${referenceFlash ? `val-flash-${referenceFlash}` : ''}`}>
          {asset.referencePrice === null ? '—' : `$${formatPrice(asset.referencePrice)}`}
        </strong>
        <span className="secondary">
          {asset.referenceSource === 'Alpaca Overnight Indicative'
            ? 'Overnight Mid (USD)'
            : isStale
            ? 'Last Close · Ref Closed (USD)'
            : asset.referenceSource ? `${asset.referenceSource} (USD)` : 'Unavailable'}
        </span>
        {viewMode === 'surveillance' && asset.referencePrice !== null && asset.tokenizedPrice !== null && (
          <span className="surveillance-spread-meta">
            Spread ${(asset.tokenizedPrice - asset.referencePrice).toFixed(2)}
          </span>
        )}
      </td>

      {/* DIFFERENCE */}
      <td className="difference-cell">
        <span className="mobile-label">DIFFERENCE</span>
        <strong
          className={`dislocation-value ${
            isPositive ? 'diff-positive' : isNegative ? 'diff-negative' : 'diff-neutral'
          } ${subtle ? 'minor' : ''} ${diffFlash ? `val-flash-${diffFlash}` : ''}`}
        >
          {displayPercent(displayDiff)}
        </strong>
        <span
          className={`direction-pill ${
            isStale
              ? 'pill-indicative'
              : isPositive
              ? 'pill-premium'
              : isNegative
              ? 'pill-discount'
              : 'pill-flat'
          }`}
        >
          {isStale
            ? 'Indicative Gap'
            : asset.dislocationDirection
            ? asset.dislocationDirection.charAt(0).toUpperCase() + asset.dislocationDirection.slice(1)
            : 'Withheld'}
        </span>
        {viewMode === 'surveillance' && displayDiff !== null && isAvailable && (
          <span className="surveillance-bps-tag">
            {displayDiff > 0 ? '+' : ''}{Math.round(displayDiff * 100)} bps
          </span>
        )}
      </td>

      {/* STATUS */}
      <td className="status-cell">
        <span className="mobile-label">STATUS</span>
        <span className={`live-status-badge ${isStale ? 'status-indicative' : ''}`}>
          <span className={`status-dot ${isStale ? 'dot-amber' : ''}`} />
          <span>{isStale ? 'Ref Closed' : asset.dataStatus === 'LIVE' ? 'Live' : asset.dataStatus}</span>
        </span>
        {viewMode === 'surveillance' && (
          <span className="surveillance-pipeline-sub">{asset.marketSession}</span>
        )}
      </td>

      {/* ACTIONS */}
      <td className="actions-cell">
        <button
          className="row-investigate-btn"
          onClick={event => {
            event.stopPropagation();
            if (onInvestigate) {
              onInvestigate(asset.symbol);
            } else {
              onSelect();
            }
          }}
        >
          <span>Investigate</span>
          <InterfaceIcon name="arrow" />
        </button>
      </td>
    </tr>
  );
}
