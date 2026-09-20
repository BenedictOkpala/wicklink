'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { MarketResponse } from '@/lib/bitget/types';
import type { InvestigationReport } from '@/lib/investigation/types';
import { ageAsset, formatAge } from '@/lib/market/presentation';
import AssetRow from './AssetRow';
import { buildOverviewViewModel } from '@/lib/overview/view-model';
import shell from './ApplicationShell.module.css';
import AssetDetail from './AssetDetail';
import Navigation from './Navigation';
import ThemeToggle from './ThemeToggle';
import ActivityPanel from './ActivityPanel';
import InterfaceIcon from './InterfaceIcon';
import OverviewView from './OverviewView';
import AssetSearch from './AssetSearch';
import IntelligenceStrip from './IntelligenceStrip';
import { DataSourcesView, InvestigationsView, SystemStatusView } from './ResearchViews';

import { workspaceReducer, type WorkspaceView } from './workspace-state';

const titles: Record<WorkspaceView, string> = { overview: 'Overview', markets: 'Markets', investigations: 'Investigations', sources: 'Methodology', system: 'System Status' };

export default function MarketMonitor({ initialData }: { initialData: MarketResponse }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspace, dispatch] = useReducer(workspaceReducer, { view: 'overview', selectedSymbol: initialData.assets[0]?.symbol ?? null, investigationSymbol: null });
  const [now, setNow] = useState(() => Date.parse(initialData.fetchedAt));
  const [investigationReport, setInvestigationReport] = useState<InvestigationReport | null>(null);
  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [investigationStageIndex, setInvestigationStageIndex] = useState(0);
  const [investigationError, setInvestigationError] = useState<string | null>(null);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [marketViewMode, setMarketViewMode] = useState<'screener' | 'surveillance'>('screener');
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [sparklinesLoading, setSparklinesLoading] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement | null>(null);
  const investigationTimer = useRef<NodeJS.Timeout | null>(null);
  const refreshedTimer = useRef<NodeJS.Timeout | null>(null);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    active.current = true; setLoading(true);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch('/api/market', { cache: 'no-store', signal: abort.signal });
      const body = await response.json() as MarketResponse;
      if (!Array.isArray(body.assets) || !Array.isArray(body.events)) throw new Error('Invalid market response');
      setData(body); setError(null); setNow(Date.now());
      setJustRefreshed(true);
      if (refreshedTimer.current) clearTimeout(refreshedTimer.current);
      refreshedTimer.current = setTimeout(() => setJustRefreshed(false), 1200);
    } catch { setError('Unable to refresh market data. Retrying automatically; you can also refresh now.'); }
    finally { clearTimeout(timeout); active.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const polling = setInterval(() => void refresh(), 15000);
    const aging = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(polling);
      clearInterval(aging);
      controller.current?.abort();
      if (investigationTimer.current) clearInterval(investigationTimer.current);
      if (refreshedTimer.current) clearTimeout(refreshedTimer.current);
    };
  }, [refresh]);

  const fetchSparklines = useCallback(async () => {
    try {
      setSparklinesLoading(true);
      const res = await fetch('/api/sparklines');
      if (res.ok) {
        const json = (await res.json()) as { sparklines?: Record<string, number[]> };
        if (json?.sparklines) {
          setSparklines(json.sparklines);
        }
      }
    } catch {
      // Graceful fallback to null points
    } finally {
      setSparklinesLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void fetchSparklines(), 0);
    const sparklineInterval = setInterval(() => void fetchSparklines(), 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(sparklineInterval);
    };
  }, [fetchSparklines]);

  useEffect(() => {
    if (!navDrawerOpen) return;
    const drawer = document.getElementById('navigation-drawer');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer?.querySelector<HTMLButtonElement>('.drawer-close-btn')?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const buttons = Array.from(drawer?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === 'Escape') {
        setNavDrawerOpen(false);
        navToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [navDrawerOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    document.documentElement.classList.add('reveal-enabled');
    const sections = document.querySelectorAll('.scroll-section');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );

    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove('reveal-enabled');
    };
  }, []);

  const runInvestigation = useCallback(async (targetSymbol: string) => {
    if (investigationLoading) return;
    setInvestigationLoading(true);
    setInvestigationError(null);
    setInvestigationStageIndex(0);
    setInvestigationReport(null);

    let stage = 0;
    if (investigationTimer.current) clearInterval(investigationTimer.current);
    investigationTimer.current = setInterval(() => {
      stage = Math.min(6, stage + 1);
      setInvestigationStageIndex(stage);
    }, 450);

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: targetSymbol }),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Investigation failed with HTTP ${response.status}`);
      }
      const result: InvestigationReport = await response.json();
      setInvestigationReport(result);
    } catch (err) {
      setInvestigationError(err instanceof Error ? err.message : 'Investigation failed');
    } finally {
      if (investigationTimer.current) {
        clearInterval(investigationTimer.current);
        investigationTimer.current = null;
      }
      setInvestigationLoading(false);
    }
  }, [investigationLoading]);

  const assets = error ? [] : data.assets.map(asset => ageAsset(asset, now));
  const selectedAsset = assets.find(asset => asset.symbol === workspace.selectedSymbol) ?? assets[0];
  const comparisons = assets.filter(asset => asset.comparisonStatus === 'AVAILABLE').length;
  const session = error ? 'UNKNOWN' : data.sessionDiagnostics?.session ?? assets[0]?.marketSession;
  const overviewModel = buildOverviewViewModel({ assets, marketSession: session ?? 'UNKNOWN', limit: 5, surveillance: { fetchedAt: data.fetchedAt, snapshotAgeMs: Math.max(0, now - Date.parse(data.fetchedAt)), refreshing: loading, connection: error ? 'ERROR' : data.dataStatus === 'ERROR' ? 'UNKNOWN' : 'CONNECTED' } });
  const isNavigatingRef = useRef(false);
  const activeViewRef = useRef(workspace.view);
  const navTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    activeViewRef.current = workspace.view;
  }, [workspace.view]);

  const navigate = useCallback((view: WorkspaceView) => {
    dispatch({ type: 'navigate', view });
    activeViewRef.current = view;
    isNavigatingRef.current = true;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1400);

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    if (view === 'overview') {
      window.scrollTo({ top: 0, behavior });
      requestAnimationFrame(() => {
        document.getElementById('section-overview')?.focus({ preventScroll: true });
      });
    } else {
      const el = document.getElementById(`section-${view}`);
      if (el) {
        el.scrollIntoView({ behavior, block: 'start' });
        requestAnimationFrame(() => {
          el.focus({ preventScroll: true });
        });
      }
    }
  }, []);

  const investigate = useCallback((symbol: string) => {
    if (investigationLoading) return;
    dispatch({ type: 'investigate', symbol });
    activeViewRef.current = 'investigations';
    isNavigatingRef.current = true;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1400);

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const target = document.getElementById('section-investigations');
    if (target) {
      target.scrollIntoView({ behavior, block: 'start' });
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
    void runInvestigation(symbol);
  }, [investigationLoading, runInvestigation]);

  const handleSelectAsset = useCallback((symbol: string) => {
    dispatch({ type: 'select', symbol });
    if (workspace.view === 'overview' || workspace.view === 'investigations' || workspace.view === 'sources' || workspace.view === 'system') {
      navigate('markets');
    }
  }, [workspace.view, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sectionIds: WorkspaceView[] = ['overview', 'markets', 'investigations', 'sources', 'system'];
    let ticking = false;

    const onScroll = () => {
      if (isNavigatingRef.current) return;
      if (ticking) return;

      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (isNavigatingRef.current) return;

        const scrollBottom = window.innerHeight + window.scrollY;
        const totalHeight = document.documentElement.scrollHeight;
        if (scrollBottom >= totalHeight - 60) {
          if (activeViewRef.current !== 'system') {
            activeViewRef.current = 'system';
            dispatch({ type: 'navigate', view: 'system' });
          }
          return;
        }

        if (window.scrollY < 60) {
          if (activeViewRef.current !== 'overview') {
            activeViewRef.current = 'overview';
            dispatch({ type: 'navigate', view: 'overview' });
          }
          return;
        }

        const headerThreshold = 140;
        let currentSection: WorkspaceView = 'overview';

        for (const view of sectionIds) {
          const el = document.getElementById(`section-${view}`);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top <= headerThreshold && rect.bottom > headerThreshold) {
            currentSection = view;
            break;
          }
        }

        if (currentSection !== activeViewRef.current) {
          activeViewRef.current = currentSection;
          dispatch({ type: 'navigate', view: currentSection });
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  return (
    <div className={`app-shell ${shell.frame}`}>
      <a href="#main-workspace" className="skip-link">Skip to workspace</a>
      {navDrawerOpen && (
        <div
          className="nav-drawer-backdrop"
          onClick={() => {
            setNavDrawerOpen(false);
            navToggleRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}
      <Navigation
        view={workspace.view}
        onNavigate={navigate}
        isOpen={navDrawerOpen}
        status={<span className="drawer-surveillance"><i aria-hidden="true" />{overviewModel.surveillance.connection === 'CONNECTED' ? 'Surveillance active' : overviewModel.surveillance.connection === 'ERROR' ? 'Connection interrupted' : 'Surveillance unverified'}</span>}
        freshness={<span>{loading ? 'Refreshing snapshot...' : 'Snapshot '+formatAge(overviewModel.surveillance.snapshotAgeMs)}</span>}
        refreshControl={<button
              className={`refresh-button ${justRefreshed ? 'just-refreshed' : ''}`}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label={loading ? 'Refreshing market data' : 'Refresh market data'}
            >
              <span className={loading ? 'refreshing' : ''}>
                <InterfaceIcon name="refresh" />
              </span>
              <span>{loading ? 'Refreshing' : justRefreshed ? 'Updated' : 'Refresh'}</span>
            </button>}
        onClose={() => {
          setNavDrawerOpen(false);
          navToggleRef.current?.focus();
        }}
      />
      <main id="main-workspace" className="main-workspace" inert={navDrawerOpen}>
        <header className="workspace-header">
          <div className="header-brand-group">
            <button
              ref={navToggleRef}
              id="nav-drawer-toggle"
              type="button"
              className={`sidebar-toggle-btn dark-nav-toggle ${navDrawerOpen ? 'is-active' : ''}`}
              onClick={() => setNavDrawerOpen((prev) => !prev)}
              aria-expanded={navDrawerOpen}
              aria-controls="navigation-drawer"
              aria-label={navDrawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            >
              <InterfaceIcon name={navDrawerOpen ? 'close' : 'sidebar'} />
            </button>
            <div className="header-title-block">
              <span className="header-eyebrow">WickLink Intelligence</span>
              <h1 id="workspace-title" tabIndex={-1}>{titles[workspace.view]}</h1>
            </div>
          </div>
          <div className="header-controls">
            <AssetSearch assets={assets} onSelect={handleSelectAsset} />

            <ThemeToggle />
          </div>
        </header>

        <div className="workspace-content">
          {error && <div className="connection-alert" role="alert"><strong>Connection interrupted</strong><span>{error} Previous quotes are hidden until reconnection.</span></div>}

          <section id="section-overview" tabIndex={-1} aria-label="Overview" className="scroll-section">
            <OverviewView viewModel={overviewModel} onInvestigate={investigate} investigating={investigationLoading} onViewAllMarkets={() => navigate('markets')}/>
          </section>

          <section id="section-markets" tabIndex={-1} aria-label="Markets" className="scroll-section">
            <IntelligenceStrip assets={assets} onSelect={handleSelectAsset}/>
            <section className={`panel market-panel market-mode-${marketViewMode}`} aria-label="Reality market overview" aria-busy={loading}>
              <div className="section-heading">
                <div className="section-title">
                  <h2>REALITY MARKET OVERVIEW</h2>
                  <span>{assets.length} instruments</span>
                </div>
                <div className="market-mode-toggle" role="group" aria-label="Market view mode">
                  <button
                    type="button"
                    className={`market-mode-btn ${marketViewMode === 'screener' ? 'active' : ''}`}
                    onClick={() => setMarketViewMode('screener')}
                    aria-pressed={marketViewMode === 'screener'}
                  >
                    Market Overview
                  </button>
                  <button
                    type="button"
                    className={`market-mode-btn ${marketViewMode === 'surveillance' ? 'active' : ''}`}
                    onClick={() => setMarketViewMode('surveillance')}
                    aria-pressed={marketViewMode === 'surveillance'}
                  >
                    Deep Surveillance
                  </button>
                </div>
                <span className="comparison-count">{comparisons} / {assets.length} comparisons available</span>
              </div>
              <div className="table-container">
                <table className="market-table">
                  <thead>
                    <tr>
                      {marketViewMode === 'screener'
                        ? ['ASSET', 'BITGET RTOKEN', 'UNDERLYING', 'DISLOCATION', 'SESSION', 'STATUS'].map(label => (
                            <th scope="col" key={label}>{label}</th>
                          ))
                        : ['ASSET', 'BITGET RTOKEN & TREND', 'UNDERLYING & SPREAD', 'DISLOCATION & BPS', 'SESSION', 'STATUS'].map(label => (
                            <th scope="col" key={label}>{label}</th>
                          ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(asset => (
                      <AssetRow
                        key={asset.symbol}
                        asset={asset}
                        selected={asset.symbol === selectedAsset?.symbol}
                        onSelect={() => dispatch({ type: 'select', symbol: asset.symbol })}
                        onInvestigate={investigate}
                        sparkline={sparklines[asset.symbol]}
                        sparklineLoading={sparklinesLoading}
                        viewMode={marketViewMode}
                      />
                    ))}
                    {!assets.length && (
                      <tr className="empty-row">
                        <td colSpan={6}>
                          <span className="empty-state-label">{loading ? 'CONNECTING' : 'DATA UNAVAILABLE'}</span>
                          <h3>{loading ? 'Checking the market feeds…' : 'Waiting for verified market data.'}</h3>
                          <p>{error ?? data.message}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="market-footer">
                <span><span className="small-square"/>Bitget Reality + Alpaca references</span>
                <span>Raw differences · No FX adjustment</span>
              </div>
            </section>
            <div className="research-layout">
              <AssetDetail asset={selectedAsset} diagnostics={data.sessionDiagnostics} onInvestigate={investigate} investigating={investigationLoading} loading={loading} justRefreshed={justRefreshed}/>
              <ActivityPanel data={data} error={error}/>
            </div>
          </section>

          <section id="section-investigations" tabIndex={-1} aria-label="Investigations" className="scroll-section">
            <InvestigationsView
              symbol={workspace.investigationSymbol}
              assets={assets}
              onMarkets={() => navigate('markets')}
              report={investigationReport}
              loading={investigationLoading}
              stageIndex={investigationStageIndex}
              error={investigationError}
              onInvestigate={(symbol) => {
                dispatch({ type: 'investigate', symbol });
                void runInvestigation(symbol);
              }}
            />
          </section>

          <section id="section-sources" tabIndex={-1} aria-label="Data Sources" className="scroll-section">
            <DataSourcesView assets={assets} data={data} error={error}/>
          </section>

          <section id="section-system" tabIndex={-1} aria-label="System Status" className="scroll-section">
            <SystemStatusView assets={assets} data={data} error={error}/>
          </section>

          <footer className="workspace-footer">
            <span>Real-time cross-market price discovery &middot; Bitget Reality &amp; Alpaca</span>
            <span>Read-only market intelligence &middot; All timestamps UTC</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

