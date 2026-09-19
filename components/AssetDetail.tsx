'use client';

import type { MarketAsset, MarketResponse } from '@/lib/bitget/types';
import { formatAge, formatPrice } from '@/lib/market/presentation';
import { displayPercent, sessionLabel } from './ui-format';
import { useValueFlash } from './useValueFlash';
import StatusBadge from './StatusBadge';
import InterfaceIcon from './InterfaceIcon';

export default function AssetDetail({
  asset,
  diagnostics,
  onInvestigate,
  investigating = false,
  loading = false,
  justRefreshed = false,
  id = 'asset-detail',
}: {
  asset: MarketAsset | undefined;
  diagnostics: MarketResponse['sessionDiagnostics'];
  onInvestigate: (symbol: string) => void;
  investigating?: boolean;
  loading?: boolean;
  justRefreshed?: boolean;
  id?: string;
}) {
  const isStale = asset ? (asset.comparisonStatus === 'STALE' || asset.isIndicativeOnly) : false;
  const activePercent = asset ? (isStale ? (asset.indicativeGapPercent ?? asset.rawDislocationPercent) : asset.rawDislocationPercent) : null;
  const tokenizedFlash = useValueFlash(asset?.symbol, asset?.tokenizedPrice ?? null, formatPrice);
  const referenceFlash = useValueFlash(asset?.symbol, asset?.referencePrice ?? null, formatPrice);
  const diffFlash = useValueFlash(asset?.symbol, activePercent, displayPercent);

  if (!asset) {
    return (
      <section id={id} className="panel detail-card detail-empty">
        <span className="field-label">MARKET EVIDENCE</span>
        <div className="empty-symbol-circle">
          <InterfaceIcon name="overview" />
        </div>
        <h3>Select an asset to inspect</h3>
        <p>Live observations, reference provenance and comparison metrics appear here.</p>
      </section>
    );
  }

  const isPositive = (activePercent ?? 0) > 0;
  const isNegative = (activePercent ?? 0) < 0;
  const directionText = isStale
    ? 'INDICATIVE GAP'
    : asset.dislocationDirection
    ? asset.dislocationDirection.toUpperCase()
    : 'WITHHELD';

  const summaryText = isStale
    ? `Reference market is currently closed (${sessionLabel(asset.marketSession)}). Showing indicative difference against last known reference price.`
    : asset.dislocationDirection === 'premium'
    ? `Tokenized price is trading above the reference price. This asset has been flagged for investigation.`
    : asset.dislocationDirection === 'discount'
    ? `Tokenized price is trading below the reference price. This asset has been flagged for investigation.`
    : `Prices are closely aligned between tokenized spot and reference feeds.`;

  return (
    <section id={id} className="panel detail-card" aria-label={`${asset.symbol} research workspace`}>
      {/* Header: Symbol, Company & Brand Badge */}
      <div className="detail-header">
        <div className="detail-title-group">
          <div className="detail-symbol-row">
            <h2>{asset.symbol}</h2>
            <span className="detail-token-sub">/ r{asset.symbol}</span>
          </div>
          <p className="detail-company-name">{asset.displayName}</p>
        </div>
        <div className={`detail-logo-badge monogram-${asset.symbol.toLowerCase()}`}>
          <span>{asset.symbol.slice(0, 1)}</span>
        </div>
      </div>

      {/* 2x2 Key Metric Grid */}
      <div className="detail-metrics-grid">
        <div className="detail-metric-box">
          <span className="metric-box-label">Tokenized Price (USDT)</span>
          <strong className={`metric-box-value ${tokenizedFlash ? `val-flash-${tokenizedFlash}` : ''}`}>${formatPrice(asset.tokenizedPrice)}</strong>
        </div>
        <div className="detail-metric-box">
          <span className="metric-box-label">Reference Price (USD)</span>
          <strong className={`metric-box-value ${referenceFlash ? `val-flash-${referenceFlash}` : ''}`}>
            {asset.referencePrice === null ? '—' : `$${formatPrice(asset.referencePrice)}`}
          </strong>
        </div>
        <div className="detail-metric-box">
          <span className="metric-box-label">{isStale ? 'Indicative Gap' : 'Difference'}</span>
          <div className="metric-diff-row">
            <strong
              className={`metric-diff-value ${
                isPositive ? 'diff-positive' : isNegative ? 'diff-negative' : 'diff-neutral'
              } ${diffFlash ? `val-flash-${diffFlash}` : ''}`}
            >
              {displayPercent(activePercent)}
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
              {directionText}
            </span>
          </div>
        </div>
        <div className="detail-metric-box">
          <span className="metric-box-label">Market Session</span>
          <strong className="metric-box-value session-val">{sessionLabel(asset.marketSession)}</strong>
        </div>
      </div>

      {/* Indicative Gap / Session Notice Banner */}
      {isStale && (
        <div className="indicative-gap-callout" style={{ background: 'var(--amber-surface, rgba(245, 158, 11, 0.08))', border: '1px solid var(--amber-border, rgba(245, 158, 11, 0.25))', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <InterfaceIcon name="clock" />
          <span style={{ fontSize: '12px', color: 'var(--text)' }}>
            <strong>Reference market closed:</strong> Using last available reference for indicative context only. Excluded from active dislocations.
          </span>
        </div>
      )}

      {/* Hero CTA Button: First button in component for verify-ui contract */}
      <div className="detail-action-wrap">
        <button
          className="hero-investigate-btn"
          onClick={() => onInvestigate(asset.symbol)}
          disabled={investigating}
          aria-busy={investigating}
        >
          <span>{investigating ? 'Investigating…' : 'Investigate dislocation'}</span>
          <InterfaceIcon name="arrow" />
        </button>
      </div>

      {/* Context Summary Note */}
      <p className="detail-summary-note">
        {asset.issue ? asset.issue : summaryText}
      </p>

      {/* Live Market Data Callout Banner */}
      <div className={`live-data-callout ${justRefreshed ? 'callout-refreshed' : ''}`}>
        <div className={`live-callout-icon ${loading ? 'icon-spinning' : ''}`}>
          <InterfaceIcon name="refresh" />
        </div>
        <div className="live-callout-text">
          <strong>Live market data</strong>
          <span>{loading ? 'Refreshing quotes…' : justRefreshed ? 'Just updated' : 'Updates every 15 seconds'}</span>
        </div>
        <div className="live-callout-status">
          <StatusBadge status={asset.dataStatus} />
        </div>
      </div>

      {/* Expandable Technical Diagnostics (contains required contract fields) */}
      <details className="technical-details">
        <summary>
          Market Evidence &amp; Provenance <span>Technical diagnostics</span>
        </summary>
        <div className="technical-details-content">
          <span className="eyebrow" style={{ marginTop: '8px' }}>MARKET EVIDENCE</span>
          <dl className="property-list">
            <div>
              <dt>Reference Source</dt>
              <dd>{asset.referenceSource ?? 'Not selected'}</dd>
            </div>
            <div>
              <dt>Reference Type</dt>
              <dd>{asset.referenceType === 'INDICATIVE_MIDPOINT' ? 'Indicative midpoint' : asset.referenceType === 'TRADE' ? 'Last eligible trade' : 'Unavailable'}</dd>
            </div>
            {asset.referenceType === 'INDICATIVE_MIDPOINT' && (
              <>
                <div>
                  <dt>Bid / Ask &middot; USD</dt>
                  <dd className="numeric">{formatPrice(asset.referenceBid)} / {formatPrice(asset.referenceAsk)}</dd>
                </div>
                <div>
                  <dt>Midpoint &middot; USD</dt>
                  <dd className="numeric">{formatPrice(asset.referencePrice)}</dd>
                </div>
              </>
            )}
            <div className="stacked">
              <dt>Reference Timestamp</dt>
              <dd className="timestamp">{asset.referenceTimestamp ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Reference Age</dt>
              <dd>{formatAge(asset.referenceAgeMs)}</dd>
            </div>
            <div className="stacked">
              <dt>Bitget Snapshot Timestamp</dt>
              <dd className="timestamp">{asset.tokenizedTimestamp ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Bitget Observation Age</dt>
              <dd>{formatAge(asset.tokenizedAgeMs)}</dd>
            </div>
            <div>
              <dt>Timestamp Skew</dt>
              <dd className="numeric">
                {asset.timestampSkewMs === null ? 'Unknown' : `${(asset.timestampSkewMs / 1000).toFixed(3)}s`}
              </dd>
            </div>
            <div>
              <dt>Comparison Status</dt>
              <dd>{asset.comparisonStatus}</dd>
            </div>
            {diagnostics?.calendarDate && (
              <div>
                <dt>Calendar Date</dt>
                <dd>{diagnostics.calendarDate}</dd>
              </div>
            )}
            <div className="stacked">
              <dt>Comparison Evaluated</dt>
              <dd className="timestamp">{asset.comparisonAsOf ?? 'Unavailable'}</dd>
            </div>
          </dl>
          {asset.issue && (
            <p className="comparison-note">
              <span className="note-marker" aria-hidden="true" />
              {asset.issue}
            </p>
          )}
          <p className="source-disclosure" style={{ marginBottom: '6px' }}>
            Currency basis: Tokenized quotes in USDT; US equity references in USD. Unadjusted raw comparison assumes 1 USDT ≈ 1 USD parity.
          </p>
          <p className="source-disclosure">
            {asset.referenceType === 'INDICATIVE_MIDPOINT'
              ? 'Derived bid/ask midpoint. Indicative, not a trade or official consolidated price.'
              : 'IEX is a single-exchange reference and may differ from consolidated SIP pricing.'}
          </p>
        </div>
      </details>
    </section>
  );
}
