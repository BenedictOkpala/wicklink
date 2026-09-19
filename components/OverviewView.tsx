'use client';

import type { MarketAsset, MarketResponse } from '@/lib/bitget/types';
import { formatAge } from '@/lib/market/presentation';
import { displayPercent, sessionLabel } from './ui-format';
import AssetRow from './AssetRow';
import AssetDetail from './AssetDetail';
import InterfaceIcon from './InterfaceIcon';
import { WickLinkMark } from './WickLinkLogo';

export default function OverviewView({
  assets,
  data,
  selectedAsset,
  onSelect,
  onInvestigate,
  investigating = false,
  now,
  onViewAllMarkets,
}: {
  assets: MarketAsset[];
  data: MarketResponse;
  selectedAsset: MarketAsset | undefined;
  onSelect: (symbol: string) => void;
  onInvestigate: (symbol: string) => void;
  investigating?: boolean;
  now: number;
  onViewAllMarkets?: () => void;
}) {
  const session = data.sessionDiagnostics?.session ?? assets[0]?.marketSession ?? 'UNKNOWN';
  const availableComparisons = assets.filter(a => a.comparisonStatus === 'AVAILABLE').length;
  const staleComparisons = assets.filter(a => a.comparisonStatus === 'STALE').length;
  const activeDislocations = assets.filter(
    a => a.comparisonStatus === 'AVAILABLE' && a.rawDislocationPercent !== null && Math.abs(a.rawDislocationPercent) >= 0.05
  ).length;

  // Curate top opportunities by absolute dislocation or indicative gap magnitude
  const displayedOpportunities = assets.length > 5
    ? [...assets]
        .sort((a, b) => {
          const valA = Math.abs(a.rawDislocationPercent ?? a.indicativeGapPercent ?? 0);
          const valB = Math.abs(b.rawDislocationPercent ?? b.indicativeGapPercent ?? 0);
          return valB - valA;
        })
        .slice(0, 5)
    : assets;

  const topRecent = [...assets]
    .filter(a => (a.rawDislocationPercent !== null || a.indicativeGapPercent !== null))
    .sort((a, b) => {
      const valA = Math.abs(a.rawDislocationPercent ?? a.indicativeGapPercent ?? 0);
      const valB = Math.abs(b.rawDislocationPercent ?? b.indicativeGapPercent ?? 0);
      return valB - valA;
    })
    .slice(0, 3);

  const fetchAge = Math.max(0, now - Date.parse(data.fetchedAt));
  const isSessionOpen = session === 'REGULAR';

  // Format local New York market time
  const nyTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: 'short',
  }).format(new Date(now));

  return (
    <div className="overview-view">
      {/* Top Bar / Market Session Ribbon from Mockup */}
      <div className="overview-top-ribbon">
        <div className="market-session-pill">
          <span className="ribbon-label">US MARKET</span>
          <span className={`session-status-dot ${isSessionOpen ? 'session-open' : 'session-closed'}`} />
          <strong className="session-status-text">{isSessionOpen ? 'OPEN' : sessionLabel(session).toUpperCase()}</strong>
          <span className="ribbon-divider">&middot;</span>
          <span className="ribbon-time">{nyTimeStr}</span>
        </div>
      </div>

      {/* Hero Headline Section from Mockup */}
      <div className="overview-hero-section">
        <div className="overview-hero-content">
          <span className="hero-eyebrow">MARKET INTELLIGENCE</span>
          <h1 className="hero-headline">
            Find what the tokenized market is pricing differently.
          </h1>
          <p className="hero-description">
            Real-time comparison between tokenized US equities and traditional market data.
            Investigate dislocations, understand the cause, and make better decisions.
          </p>
        </div>
        <div className="hero-backdrop-graphic" aria-hidden="true">
          <div className="hero-mountain-graphic" style={{ opacity: 0.65 }}>
            <WickLinkMark size={48} variant="light" />
          </div>
          <span className="hero-tagline">find the weak link in the market.</span>
        </div>
      </div>

      {/* 4 KPI Summary Cards from Mockup */}
      <div className="kpi-grid">
        {/* Card 1: Monitored Assets */}
        <div className="kpi-card">
          <div className="kpi-icon-wrap icon-database">
            <InterfaceIcon name="database" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Monitored Assets</span>
            <strong className="kpi-value">{assets.length}</strong>
            <span className="kpi-subtitle">{availableComparisons} / {assets.length} comparisons active</span>
          </div>
        </div>

        {/* Card 2: Active Dislocations (Highlighted Mint Card from Mockup) */}
        <div className="kpi-card kpi-card-highlighted">
          <div className="kpi-icon-wrap icon-pulse">
            <InterfaceIcon name="pulse" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title text-accent">Active Dislocations</span>
            <strong className="kpi-value">{activeDislocations}</strong>
            <span className="kpi-subtitle">
              {availableComparisons > 0
                ? `${activeDislocations} of ${availableComparisons} live comparisons`
                : staleComparisons > 0
                ? `${staleComparisons} indicative gaps (Ref Closed)`
                : '0 active dislocations'}
            </span>
          </div>
          <div className="kpi-arrow">
            <InterfaceIcon name="chevron" />
          </div>
        </div>

        {/* Card 3: Market Session */}
        <div className="kpi-card">
          <div className="kpi-icon-wrap icon-clock">
            <InterfaceIcon name="clock" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Market Session</span>
            <strong className="kpi-value session-title">{sessionLabel(session)}</strong>
            <span className="kpi-subtitle">US equities</span>
          </div>
          <div className="kpi-arrow">
            <InterfaceIcon name="chevron" />
          </div>
        </div>

        {/* Card 4: Data Freshness */}
        <div className="kpi-card">
          <div className="kpi-icon-wrap icon-refresh">
            <InterfaceIcon name="refresh" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Data Freshness</span>
            <strong className="kpi-value">{formatAge(fetchAge)}</strong>
            <span className="kpi-subtitle">Last update</span>
          </div>
          <div className="kpi-arrow">
            <InterfaceIcon name="chevron" />
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Table & Cards (68%), Right Inspection (32%) */}
      <div className="overview-main-layout">
        {/* Left Column */}
        <div className="overview-left-column">
          {/* Main Screener Card: Market Opportunities */}
          <div className="panel opportunities-card">
            <div className="panel-header-row">
              <div>
                <h2 className="opportunities-title">Market Opportunities</h2>
                <p className="opportunities-subtitle">Live tokenized prices vs traditional market references</p>
              </div>
              <div className="opportunities-filter">
                {onViewAllMarkets ? (
                  <button
                    type="button"
                    className="filter-pill filter-pill-button"
                    onClick={onViewAllMarkets}
                    aria-label={`View all ${assets.length} assets in Markets`}
                  >
                    View all {assets.length} assets &rarr;
                  </button>
                ) : (
                  <span className="filter-pill">Top opportunities &#9662;</span>
                )}
              </div>
            </div>

            <div className="table-container">
              <table className="market-table">
                <thead>
                  <tr>
                    <th scope="col">ASSET</th>
                    <th scope="col">TOKENIZED PRICE &#9432;</th>
                    <th scope="col">REFERENCE PRICE &#9432;</th>
                    <th scope="col">DIFFERENCE</th>
                    <th scope="col">STATUS</th>
                    <th scope="col" style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOpportunities.map(asset => (
                    <AssetRow
                      key={asset.symbol}
                      asset={asset}
                      selected={asset.symbol === selectedAsset?.symbol}
                      onSelect={() => onSelect(asset.symbol)}
                      onInvestigate={onInvestigate}
                    />
                  ))}
                  {!assets.length && (
                    <tr className="empty-row">
                      <td colSpan={6}>
                        <span className="empty-state-label">CONNECTING</span>
                        <h3>Waiting for verified market data.</h3>
                        <p>{data.message}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel-footer-note">
              <span>
                Showing top {displayedOpportunities.length} of {assets.length} monitored assets &middot;{' '}
                {data.fxRate
                  ? `USDT/USD: $${data.fxRate.rate.toFixed(4)} (${data.fxRate.parityDeltaPercent >= 0 ? '+' : ''}${data.fxRate.parityDeltaPercent.toFixed(3)}%)`
                  : 'Raw USDT / USD (1:1 parity assumed)'}
              </span>
              {onViewAllMarkets ? (
                <button
                  type="button"
                  className="footer-markets-link"
                  onClick={onViewAllMarkets}
                >
                  Full Markets Desk ({assets.length} assets) &rarr;
                </button>
              ) : (
                <span>Click any row to inspect microstructure evidence</span>
              )}
            </div>
          </div>

          {/* Lower Two Cards Side-by-Side */}
          <div className="overview-subcards-grid">
            {/* Recent Dislocations Card */}
            <div className="panel subcard-recent">
              <div className="subcard-header">
                <div>
                  <h3 className="subcard-title">Recent Dislocations</h3>
                  <p className="subcard-subtitle">Largest observed differences across monitored assets</p>
                </div>
                {onViewAllMarkets && (
                  <button
                    type="button"
                    className="subcard-action-link-btn"
                    onClick={onViewAllMarkets}
                  >
                    View all &rarr;
                  </button>
                )}
              </div>
              <div className="recent-list">
                {topRecent.map(asset => {
                  const isPos = (asset.rawDislocationPercent ?? 0) > 0;
                  const isNeg = (asset.rawDislocationPercent ?? 0) < 0;
                  return (
                    <div
                      key={asset.symbol}
                      className="recent-item-row"
                      onClick={() => onSelect(asset.symbol)}
                    >
                      <div className="recent-item-asset">
                        <span className={`asset-monogram-sm monogram-${asset.symbol.toLowerCase()}`}>
                          {asset.symbol.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{asset.symbol}</strong>
                          <span>{asset.displayName}</span>
                        </div>
                      </div>
                      <div className="recent-item-diff">
                        <strong className={isPos ? 'diff-positive' : isNeg ? 'diff-negative' : 'diff-neutral'}>
                          {displayPercent(asset.rawDislocationPercent)}
                        </strong>
                        <span className="direction-label">
                          {asset.dislocationDirection ? asset.dislocationDirection.charAt(0).toUpperCase() + asset.dislocationDirection.slice(1) : 'Flat'}
                        </span>
                      </div>
                      <div className="recent-item-time">
                        <span>{formatAge(asset.tokenizedAgeMs)}</span>
                        <small>Detected</small>
                      </div>
                      <div className="recent-item-arrow">
                        <InterfaceIcon name="chevron" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Why Dislocations Happen Educational Card */}
            <div className="panel subcard-reasons">
              <div className="subcard-header">
                <div>
                  <h3 className="subcard-title">Why dislocations happen</h3>
                  <p className="subcard-subtitle">Common reasons for tokenized vs traditional price differences</p>
                </div>
                <span className="subcard-action-link">Learn more &rarr;</span>
              </div>
              <div className="reasons-list">
                <div className="reason-item">
                  <div className="reason-icon-wrap">
                    <InterfaceIcon name="clock" />
                  </div>
                  <div>
                    <strong>After-hours activity</strong>
                    <p>Tokenized markets trade 24/7</p>
                  </div>
                </div>
                <div className="reason-item">
                  <div className="reason-icon-wrap">
                    <InterfaceIcon name="markets" />
                  </div>
                  <div>
                    <strong>Liquidity differences</strong>
                    <p>Lower liquidity can cause temporary price gaps</p>
                  </div>
                </div>
                <div className="reason-item">
                  <div className="reason-icon-wrap">
                    <InterfaceIcon name="database" />
                  </div>
                  <div>
                    <strong>News timing</strong>
                    <p>Information may reach markets at different times</p>
                  </div>
                </div>
                <div className="reason-item">
                  <div className="reason-icon-wrap">
                    <InterfaceIcon name="system" />
                  </div>
                  <div>
                    <strong>Market microstructure</strong>
                    <p>Different order books and trading mechanisms</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Asset Inspection & Brand Banner */}
        <div className="overview-right-column">
          <AssetDetail
            asset={selectedAsset}
            diagnostics={data.sessionDiagnostics}
            onInvestigate={onInvestigate}
            investigating={investigating}
            id="overview-asset-detail"
          />

          {/* Brand Quote Card */}
          <div className="panel brand-quote-card">
            <div className="quote-content">
              <p className="quote-text">&ldquo;Different markets.<br />A clearer view.&rdquo;</p>
              <div className="quote-brand">
                <strong>WickLink</strong>
                <span>find the weak link in the market.</span>
              </div>
            </div>
            <div className="quote-mountain-silhouette" aria-hidden="true" style={{ opacity: 0.12 }}>
              <WickLinkMark size={140} variant="light" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
