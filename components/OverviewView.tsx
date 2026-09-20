'use client';

import type { OverviewViewModel } from '@/lib/overview/types';
import { formatAge, formatPrice } from '@/lib/market/presentation';
import { displayPercent } from './ui-format';
import InterfaceIcon from './InterfaceIcon';
import styles from './OverviewView.module.css';

export default function OverviewView({ viewModel, onInvestigate, investigating = false, onViewAllMarkets }: {
  viewModel: OverviewViewModel;
  onInvestigate: (symbol: string) => void;
  investigating?: boolean;
  onViewAllMarkets: () => void;
}) {
  const { mode, surveillance, displayedAssets, totalMonitoredAssetCount } = viewModel;
  const offHours = mode !== 'REGULAR' && mode !== 'UNKNOWN';
  const heading = mode === 'UNKNOWN' ? 'Market Watch' : offHours ? 'Overnight Watch' : 'Worth Watching';
  const connected = surveillance.connection === 'CONNECTED';
  const emptyMessage = mode === 'UNKNOWN'
    ? 'The US reference session could not be verified. Comparisons are withheld until session context is available.'
    : surveillance.connection === 'ERROR'
    ? 'Market data could not be refreshed. Comparisons will return when the connection is restored.'
    : 'No valid comparisons currently meet the Overview criteria. The full market desk remains available.';

  return <div className={styles.overview}>
    <div className={styles.marketContext} aria-label="Market context">
      <span className={styles.surveillance}><i className={connected ? styles.connected : styles.disconnected} aria-hidden="true"/>{connected ? 'Surveillance active' : surveillance.connection === 'ERROR' ? 'Connection interrupted' : 'Surveillance unverified'}</span>
      <span>{viewModel.context}</span>
      <span className={styles.freshness}>{surveillance.refreshing ? 'Refreshing snapshot…' : surveillance.snapshotAgeMs !== null ? `Snapshot ${formatAge(surveillance.snapshotAgeMs)}` : 'Snapshot age unavailable'}</span>
    </div>
    <section className={styles.watch} aria-labelledby="overview-watch-title" aria-busy={surveillance.refreshing}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>WICKLINK / INTELLIGENCE DESK</span>
        <h2 id="overview-watch-title">{heading}</h2>
        <p>{viewModel.selectedGroup === 'INDICATIVE' ? 'Indicative differences against available references. Not live dislocations.' : viewModel.selectedGroup === 'LIVE' ? 'Current comparisons, ordered by the size of the difference.' : 'Attention starts with a verified comparison.'}</p>
      </header>
      {displayedAssets.length > 0 ? <ol className={styles.list} aria-label="Ranked market comparisons">
        {displayedAssets.map((asset, index) => <li className={styles.item} key={asset.tokenizedSymbol} data-overview-symbol={asset.symbol}>
          <span className={styles.rank} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div className={styles.identity}><h3>{asset.symbol}</h3><span>{asset.displayName}</span></div>
          <div className={styles.difference}><strong>{displayPercent(asset.comparison.percent)}</strong><span>{asset.comparison.kind === 'INDICATIVE' ? 'Indicative gap' : asset.comparison.kind === 'WITHHELD' ? 'Withheld' : asset.comparison.direction === 'flat' ? 'Flat comparison' : asset.comparison.direction === 'premium' ? 'Premium' : 'Discount'}</span></div>
          <div className={styles.prices}><span><b>{formatPrice(asset.tokenizedPrice)}</b> <small>{asset.quoteCurrency} tokenized</small></span><span><b>{formatPrice(asset.referencePrice)}</b> <small>{asset.referenceCurrency ?? 'USD'} reference</small></span></div>
          <p className={styles.context}>{asset.context}</p>
          <details className={styles.provenance}><summary>Reference &amp; freshness{asset.requiresCaution ? ' · context matters' : ''}</summary>
            <dl><div><dt>Source</dt><dd>{asset.referenceSource ?? 'Unavailable'}</dd></div><div><dt>Reference type</dt><dd>{asset.referenceType === 'INDICATIVE_MIDPOINT' ? 'Indicative bid/ask midpoint' : asset.referenceType === 'TRADE' ? 'Trade' : 'Unavailable'}</dd></div><div><dt>Reference observation</dt><dd>{asset.referenceTimestamp ?? 'Unavailable'} · {formatAge(asset.referenceAgeMs)}</dd></div><div><dt>Tokenized observation</dt><dd>{asset.tokenizedTimestamp ?? 'Unavailable'} · {formatAge(asset.tokenizedAgeMs)}</dd></div></dl>
            {asset.cautions.includes('SINGLE_EXCHANGE_REFERENCE') && <p>IEX is a single-exchange reference, not consolidated SIP pricing.</p>}
            {asset.cautions.includes('INDICATIVE_MIDPOINT') && <p>Indicative midpoint, not an executed trade. Bid {formatPrice(asset.referenceBid)} / Ask {formatPrice(asset.referenceAsk)}.</p>}
            {asset.cautions.includes('TIMESTAMP_MISMATCH') && <p>Observation timestamps are not sufficiently aligned for a live comparison.</p>}
            {asset.cautions.includes('STALE_OBSERVATION') && <p>One or more observations are delayed. This comparison is context only.</p>}
            {asset.cautions.includes('CURRENCY_BASIS') && <p>Raw USDT versus USD comparison; no FX adjustment.</p>}
          </details>
          <button type="button" className={styles.investigate} aria-label={`Investigate ${asset.symbol}`} disabled={investigating || !asset.investigationAvailable} title={asset.investigationUnavailableReason ?? undefined} onClick={() => onInvestigate(asset.symbol)}><span>{investigating ? 'Investigating…' : 'Investigate'}</span><InterfaceIcon name="arrow"/></button>
        </li>)}
      </ol> : <div className={styles.empty} role="status"><span className={styles.emptyRule}/><h3>{mode === 'UNKNOWN' ? 'Session context unavailable' : 'No comparisons to surface'}</h3><p>{emptyMessage}</p></div>}
      <footer className={styles.footer}><button type="button" onClick={onViewAllMarkets} aria-label={`View all ${totalMonitoredAssetCount} assets in Markets`}>View all {totalMonitoredAssetCount} assets <InterfaceIcon name="arrow"/></button><span>Full coverage in Markets</span></footer>
    </section>
  </div>;
}
