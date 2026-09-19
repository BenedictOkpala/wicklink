'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { MarketResponse } from '@/lib/bitget/types';
import type { InvestigationReport } from '@/lib/investigation/types';
import { ageAsset, formatAge } from '@/lib/market/presentation';
import AssetRow from './AssetRow';
import AssetDetail from './AssetDetail';
import StatusBadge from './StatusBadge';
import Navigation from './Navigation';
import ActivityPanel from './ActivityPanel';
import InterfaceIcon from './InterfaceIcon';
import OverviewView from './OverviewView';
import AssetSearch from './AssetSearch';
import { DataSourcesView, InvestigationsView, SystemStatusView } from './ResearchViews';
import { aggregateStatus, sessionLabel, timeLabel } from './ui-format';
import { workspaceReducer, type WorkspaceView } from './workspace-state';

const titles: Record<WorkspaceView, string> = { overview: 'Overview', markets: 'Markets', investigations: 'Investigations', sources: 'Data Sources', system: 'System Status' };

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
  const status = error ? 'ERROR' : assets.length ? aggregateStatus(assets.map(asset => asset.dataStatus)) : data.dataStatus;
  const comparisons = assets.filter(asset => asset.comparisonStatus === 'AVAILABLE').length;
  const session = error ? 'UNKNOWN' : data.sessionDiagnostics?.session ?? assets[0]?.marketSession;
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
    }, 850);

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    if (view === 'overview') {
      window.scrollTo({ top: 0, behavior });
    } else {
      const el = document.getElementById(`section-${view}`);
      if (el) {
        el.scrollIntoView({ behavior, block: 'start' });
      }
    }
    requestAnimationFrame(() => {
      document.getElementById('workspace-title')?.focus({ preventScroll: true });
    });
  }, []);

  const investigate = useCallback((symbol: string) => {
    if (investigationLoading) return;
    dispatch({ type: 'investigate', symbol });
    activeViewRef.current = 'investigations';
    isNavigatingRef.current = true;
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 850);

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const target = document.getElementById('section-investigations');
    if (target) {
      target.scrollIntoView({ behavior, block: 'start' });
    }
    requestAnimationFrame(() => {
      document.getElementById('workspace-title')?.focus({ preventScroll: true });
    });
    void runInvestigation(symbol);
  }, [investigationLoading, runInvestigation]);

  const handleSelectAsset = useCallback((symbol: string) => {
    dispatch({ type: 'select', symbol });
    if (workspace.view === 'sources' || workspace.view === 'system') {
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

  return <div className="app-shell"><a href="#main-workspace" className="skip-link">Skip to workspace</a><Navigation view={workspace.view} onNavigate={navigate}/>
    <main id="main-workspace" className="main-workspace"><header className="workspace-header"><div className="header-title-block"><span className="header-eyebrow">WickLink Intelligence</span><h1 id="workspace-title" tabIndex={-1}>{titles[workspace.view]}</h1></div><div className="header-controls"><AssetSearch assets={assets} onSelect={handleSelectAsset}/><div className="session-indicator"><span>US Market</span><strong>{sessionLabel(session)}</strong></div><StatusBadge status={status}/><button className={`refresh-button ${justRefreshed ? 'just-refreshed' : ''}`} onClick={() => void refresh()} disabled={loading} aria-label={loading ? 'Refreshing market data' : 'Refresh market data'}><span className={loading ? 'refreshing' : ''}><InterfaceIcon name="refresh"/></span><span>{loading ? 'Refreshing' : justRefreshed ? 'Updated' : 'Refresh'}</span></button></div></header>
    <div className="workspace-content">
      <div className="refresh-meta"><span>Last check <time className={justRefreshed ? 'time-flash' : ''}>{timeLabel(data.fetchedAt)}</time><span className="data-divider">/</span>{formatAge(Math.max(0, now - Date.parse(data.fetchedAt)))}</span><span>Auto-refresh every 15s</span></div>
      {error && <div className="connection-alert" role="alert"><strong>Connection interrupted</strong><span>{error} Previous quotes are hidden until reconnection.</span></div>}
      <section id="section-overview" aria-label="Overview" className="scroll-section">
        <OverviewView
          assets={assets}
          data={data}
          selectedAsset={selectedAsset}
          onSelect={(symbol) => dispatch({ type: 'select', symbol })}
          onInvestigate={investigate}
          investigating={investigationLoading}
          now={now}
          onViewAllMarkets={() => navigate('markets')}
        />
      </section>

      <section id="section-markets" aria-label="Markets" className="scroll-section">
        <section className="panel market-panel" aria-label="Reality market overview" aria-busy={loading}><div className="section-heading"><div className="section-title"><h2>REALITY MARKET OVERVIEW</h2><span>{assets.length} instruments</span></div><span className="comparison-count">{comparisons} / {assets.length} comparisons available</span></div>
          <div className="table-container"><table className="market-table"><thead><tr>{['ASSET', 'BITGET RTOKEN', 'UNDERLYING', 'DISLOCATION', 'SESSION', 'STATUS'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{assets.map(asset => <AssetRow key={asset.symbol} asset={asset} selected={asset.symbol === selectedAsset?.symbol} onSelect={() => dispatch({ type: 'select', symbol: asset.symbol })}/>)}{!assets.length && <tr className="empty-row"><td colSpan={6}><span className="empty-state-label">{loading ? 'CONNECTING' : 'DATA UNAVAILABLE'}</span><h3>{loading ? 'Checking the market feeds…' : 'Waiting for verified market data.'}</h3><p>{error ?? data.message}</p></td></tr>}</tbody></table></div>
          <div className="market-footer"><span><span className="small-square"/>Bitget Reality + Alpaca references</span><span>Raw differences · No FX adjustment</span></div>
        </section>
        <div className="research-layout"><AssetDetail asset={selectedAsset} diagnostics={data.sessionDiagnostics} onInvestigate={investigate} investigating={investigationLoading} loading={loading} justRefreshed={justRefreshed}/><ActivityPanel data={data} error={error}/></div>
      </section>

      <section id="section-investigations" aria-label="Investigations" className="scroll-section">
        <InvestigationsView symbol={workspace.investigationSymbol} assets={assets} onMarkets={() => navigate('markets')} report={investigationReport} loading={investigationLoading} stageIndex={investigationStageIndex} error={investigationError} onInvestigate={(symbol) => { dispatch({ type: 'investigate', symbol }); void runInvestigation(symbol); }}/>
      </section>

      <section id="section-sources" aria-label="Data Sources" className="scroll-section">
        <DataSourcesView assets={assets} data={data} error={error}/>
      </section>

      <section id="section-system" aria-label="System Status" className="scroll-section">
        <SystemStatusView assets={assets} data={data} error={error}/>
      </section>

      <footer className="workspace-footer"><span>Real-time cross-market price discovery &middot; Bitget Reality &amp; Alpaca</span><span>Read-only market intelligence &middot; All timestamps UTC</span></footer>
    </div></main>
  </div>;
}
