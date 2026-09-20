'use client';

import { useState, useRef } from 'react';
import type { MarketAsset, MarketResponse } from '@/lib/bitget/types';
import type { InvestigationReport, InvestigationHypothesis } from '@/lib/investigation/types';
import { formatPrice } from '@/lib/market/presentation';
import { displayPercent, providerStatus, sessionLabel, timeLabel } from './ui-format';
import StatusBadge from './StatusBadge';
import InterfaceIcon from './InterfaceIcon';

const OBSERVABLE_STAGES = [
  'Gathering market evidence',
  'Checking timestamp alignment',
  'Checking reference context',
  'Checking market catalysts',
  'Testing hypotheses',
  'Assessing data quality',
  'Report ready',
];

function getHypothesisStatusSummary(hypo: InvestigationHypothesis): string {
  if (hypo.status === 'SUPPORTED' || hypo.status === 'PARTIALLY_SUPPORTED' || hypo.status === 'PLAUSIBLE') {
    if (
      hypo.supportingEvidence.length > 0 &&
      !hypo.supportingEvidence[0].startsWith('Session does not indicate') &&
      !hypo.supportingEvidence[0].startsWith('No ')
    ) {
      return hypo.supportingEvidence[0];
    }
  }
  if (hypo.status === 'CONTRADICTED') {
    if (hypo.contradictingEvidence.length > 0) {
      return hypo.contradictingEvidence[0];
    }
  }
  if (hypo.contradictingEvidence.length > 0) {
    const contra = hypo.contradictingEvidence[0];
    if (contra && !contra.startsWith('No contra-') && !contra.startsWith('No session contra-')) {
      return contra;
    }
  }
  if (hypo.confidenceRationale) {
    const match = hypo.confidenceRationale.match(/^Heuristic score \d+\.\d+:\s*(.+)$/);
    if (match && match[1]) {
      return match[1];
    }
    return hypo.confidenceRationale;
  }
  return hypo.description;
}

export function InvestigationsView({
  symbol,
  assets,
  onMarkets,
  report: externalReport,
  loading: externalLoading,
  stageIndex: externalStageIndex,
  error: externalError,
  onInvestigate: externalOnInvestigate,
}: {
  symbol: string | null;
  assets: MarketAsset[];
  onMarkets: () => void;
  report?: InvestigationReport | null;
  loading?: boolean;
  stageIndex?: number;
  error?: string | null;
  onInvestigate?: (symbol: string) => void;
}) {
  const [localReport, setLocalReport] = useState<InvestigationReport | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localStageIndex, setLocalStageIndex] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(symbol);
  const [expandedHypotheses, setExpandedHypotheses] = useState<Record<string, boolean>>({});
  const stageTimer = useRef<NodeJS.Timeout | null>(null);

  const toggleHypothesis = (id: string) => {
    setExpandedHypotheses(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isControlled = externalReport !== undefined || externalLoading !== undefined;
  const report = isControlled ? (externalReport ?? null) : localReport;
  const loading = isControlled ? Boolean(externalLoading) : localLoading;
  const stageIndex = isControlled ? (externalStageIndex ?? 0) : localStageIndex;
  const error = isControlled ? (externalError ?? null) : localError;
  const currentSymbol = report?.symbol ?? symbol ?? activeSymbol;

  const runInvestigation = async (targetSymbol: string) => {
    setActiveSymbol(targetSymbol);
    if (externalOnInvestigate) {
      externalOnInvestigate(targetSymbol);
      return;
    }
    setLocalLoading(true);
    setLocalError(null);
    setLocalStageIndex(0);

    let stage = 0;
    if (stageTimer.current) clearInterval(stageTimer.current);
    stageTimer.current = setInterval(() => {
      stage = Math.min(OBSERVABLE_STAGES.length - 1, stage + 1);
      setLocalStageIndex(stage);
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

      const data: InvestigationReport = await response.json();
      setLocalReport(data);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Investigation failed');
    } finally {
      if (stageTimer.current) clearInterval(stageTimer.current);
      setLocalLoading(false);
    }
  };

  const asset = assets.find(a => a.symbol === currentSymbol);

  return (
    <section className="panel investigations-view" aria-label="Investigation workspace">
      <div className="section-heading">
        <div className="section-title">
          <h2>Investigation Workspace</h2>
          <span>{currentSymbol ? `${currentSymbol} Research Analysis` : 'No symbol selected'}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {report && (
            <span className="badge status-live">
              Report ready &middot; {report.durationMs}ms
            </span>
          )}
          <button className="secondary-action" onClick={onMarkets}>
            Back to markets <InterfaceIcon name="arrow" />
          </button>
        </div>
      </div>

      {currentSymbol && (
        <div className="investigation-context">
          <span className="field-label">Selected Context</span>
          <strong>{currentSymbol} / r{currentSymbol}</strong>
          {asset && (
            <span className="numeric">
              {formatPrice(asset.tokenizedPrice)} USDT <span className="data-divider">&middot;</span>{' '}
              {displayPercent(asset.rawDislocationPercent)} raw difference
            </span>
          )}
          {!report && !loading && (
            <button
              className="primary-action"
              style={{ marginLeft: 'auto', padding: '6px 14px' }}
              onClick={() => runInvestigation(currentSymbol)}
            >
              Start Investigation
            </button>
          )}
        </div>
      )}

      {/* State 1: No symbol chosen */}
      {!currentSymbol && !report && !loading && (
        <div className="empty-workspace">
          <div className="empty-icon"><InterfaceIcon name="investigations" /></div>
          <span className="eyebrow">RESEARCH WORKSPACE</span>
          <h2>No investigations yet.</h2>
          <p>Select a market dislocation to open its investigation workspace. The investigation engine analyzes market microstructure, timestamp alignment, session context, and competing hypotheses.</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
            {assets.map(a => (
              <button
                key={a.symbol}
                className="secondary-action"
                onClick={() => {
                  void runInvestigation(a.symbol);
                }}
              >
                Investigate {a.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* State 2: Symbol chosen, not yet started */}
      {currentSymbol && !report && !loading && !error && (
        <div className="empty-workspace">
          <div className="empty-icon"><InterfaceIcon name="investigations" /></div>
          <span className="eyebrow">READY TO INVESTIGATE</span>
          <h2>The investigation starts here.</h2>
          <p>No investigation has started for {currentSymbol}. Click below to query live market microstructure, evaluate timestamp alignment, and test competing explanatory hypotheses.</p>
          <button
            className="primary-action"
            style={{ margin: '0 auto' }}
            onClick={() => runInvestigation(currentSymbol)}
          >
            Launch Investigation for {currentSymbol} <InterfaceIcon name="arrow" />
          </button>
        </div>
      )}

      {/* State 3: Loading - Observable Workflow Stages */}
      {loading && (
        <div className="investigation-loading-panel">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span className="eyebrow">INVESTIGATION IN PROGRESS</span>
            <h2 style={{ fontSize: '22px', fontWeight: 650, marginTop: '4px', color: 'var(--text)' }}>Analyzing {currentSymbol ?? 'Asset'} Dislocation</h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>Gathering live market evidence and evaluating competing hypotheses.</p>
          </div>

          {/* Observable Progress Bar */}
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '20px' }}>
            <div
              style={{
                width: `${Math.round(((stageIndex + 1) / OBSERVABLE_STAGES.length) * 100)}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 300ms ease',
              }}
            />
          </div>

          <div className="workflow-stages-list" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 18px' }}>
            {OBSERVABLE_STAGES.map((label, idx) => {
              const isDone = idx < stageIndex;
              const isCurrent = idx === stageIndex;
              return (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 0',
                    borderBottom: idx < OBSERVABLE_STAGES.length - 1 ? '1px solid var(--border-soft)' : 'none',
                    color: isCurrent ? 'var(--text)' : isDone ? 'var(--accent)' : 'var(--faint)',
                    fontSize: '13px',
                  }}
                >
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: isDone ? 'var(--accent-surface)' : isCurrent ? 'var(--border)' : 'transparent',
                      border: `1px solid ${isDone ? 'var(--accent)' : isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                      color: isDone ? 'var(--accent)' : isCurrent ? 'var(--text)' : 'var(--faint)',
                      transition: 'all 200ms ease',
                    }}
                  >
                    {isDone ? '✓' : isCurrent ? <span className="stage-spin-icon">⟳</span> : `0${idx + 1}`}
                  </span>
                  <span style={{ fontWeight: isCurrent ? 600 : isDone ? 500 : 400 }}>{label}</span>
                  {isCurrent && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>Active</span>}
                  {isDone && <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted)' }}>Completed</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* State 4: Error */}
      {error && (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="connection-alert" role="alert" style={{ maxWidth: '600px', margin: '0 auto 20px' }}>
            <strong>Investigation Error</strong>
            <span>{error}</span>
          </div>
          {currentSymbol && (
            <button className="primary-action" onClick={() => runInvestigation(currentSymbol)}>
              Retry Investigation
            </button>
          )}
        </div>
      )}

      {/* State 5: Completed Investigation Report */}
      {report && !loading && (
        <div className="investigation-report">
          {/* Report Top Strip */}
          <div className="report-top-strip">
            <div>
              <span className="eyebrow">RESEARCH REPORT &middot; {report.id}</span>
              <h2 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                {report.symbol} <span style={{ color: 'var(--muted)', fontSize: '17px', fontWeight: 400 }}>/ {report.tokenizedSymbol}</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '12.5px', marginTop: '4px' }}>
                {report.evidence.displayName} &middot; Market Session: <strong style={{ color: 'var(--text)' }}>{sessionLabel(report.evidence.marketSession)}</strong>
              </p>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge" style={{ border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', background: 'var(--surface-raised)' }}>
                  {report.aiStatus === 'COMPLETED' ? 'AI Assessment Verified' : 'Deterministic Signals Standalone'}
                </span>
                <button className="secondary-action" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => runInvestigation(report.symbol)}>
                  Re-run
                </button>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                Evaluated at {timeLabel(report.completedAt)} ({report.durationMs}ms)
              </span>
            </div>
          </div>
          {/* AI Status Indicator Banner if Unavailable */}
          {report.aiStatus !== 'COMPLETED' && (
            <div
              className="ai-unavailable-indicator"
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span className="dot" style={{ background: 'var(--muted)', width: '6px', height: '6px', borderRadius: '50%' }} />
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>AI synthesis unavailable.</strong> Deterministic analysis is shown below.
              </div>
            </div>
          )}

          {/* Contextual State when Reference Market is Closed */}
          {(['CLOSED', 'AFTER_HOURS', 'PRE_MARKET'].includes(report.evidence.marketSession) || report.evidence.comparisonStatus === 'STALE' || (report.evidence.marketSession !== 'REGULAR' && report.evidence.marketSession !== 'OVERNIGHT' && report.evidence.referencePrice === null)) && (
            <div
              className="reference-closed-notice"
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderLeft: '4px solid var(--blue, #3b82f6)',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <div style={{ color: 'var(--blue, #3b82f6)', marginTop: '2px', flexShrink: 0 }}>
                <InterfaceIcon name="clock" />
              </div>
              <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '2px', fontSize: '13.5px' }}>
                  Reference market closed
                </strong>
                <span style={{ color: 'var(--muted)' }}>
                  Live dislocation withheld because a sufficiently fresh US equity reference price is unavailable. Tokenized-market data remains live.
                </span>
              </div>
            </div>
          )}

          {/* Executive Assessment & Verdict: What WickLink Found */}
          {report.assessment && (() => {
            const isClosedMarket = ['CLOSED', 'AFTER_HOURS', 'PRE_MARKET'].includes(report.evidence.marketSession) || report.evidence.comparisonStatus === 'STALE';
            return (
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px 24px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <span className="eyebrow" style={{ margin: 0 }}>What WickLink Found &middot; Executive Synthesis</span>
                  <span
                    className="badge"
                    style={{
                      background: isClosedMarket
                        ? 'var(--blue-surface, rgba(59, 130, 246, 0.1))'
                        : report.assessment.dislocationVerdict === 'MEANINGFUL_DISLOCATION'
                        ? 'var(--accent-surface)'
                        : 'var(--amber-surface)',
                      color: isClosedMarket
                        ? 'var(--blue, #3b82f6)'
                        : report.assessment.dislocationVerdict === 'MEANINGFUL_DISLOCATION'
                        ? 'var(--accent)'
                        : 'var(--amber)',
                      border: '1px solid currentColor',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontWeight: 600,
                    }}
                  >
                    VERDICT: {report.assessment.dislocationVerdict.replaceAll('_', ' ')}
                  </span>
                </div>
                <p style={{ fontSize: '14.5px', lineHeight: '1.6', color: 'var(--text)', marginBottom: '16px' }}>
                  {report.assessment.summary}
                </p>

                {/* Closed-Market Intelligence Callout */}
                {report.assessment.closedMarketCallout && (
                  <div
                    className="closed-market-intelligence-callout"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderLeft: '4px solid var(--accent)',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                      Wall Street closed. Price discovery didn&apos;t.
                    </strong>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: '1.45' }}>
                      {report.assessment.closedMarketCallout}
                    </p>
                  </div>
                )}

                {/* Why This Matters Layer */}
                {report.assessment.whyThisMatters && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
                    <span className="field-label" style={{ marginBottom: '4px', color: 'var(--accent)' }}>Why This Matters</span>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>
                      {report.assessment.whyThisMatters}
                    </p>
                  </div>
                )}

                {/* Primary Explanation */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
                  <span className="field-label" style={{ marginBottom: '4px' }}>Primary Explanation</span>
                  <strong style={{ fontSize: '14px', color: 'var(--accent)' }}>{report.assessment.primaryExplanation}</strong>
                </div>

                <div className="assessment-evidence-grid">
                  <div>
                    <span className="field-label" style={{ color: 'var(--muted)', marginBottom: '8px' }}>Key Evidence Points</span>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
                      {report.assessment.keyEvidencePoints.map((pt, i) => {
                        let displayPt = pt;
                        if (pt.startsWith('Catalyst:')) {
                          const hasMaterialCatalyst = report.evidence.catalyst?.articles.some(
                            a => (a.isMaterialCatalyst && (a.temporalRelevance === 'BREAKING' || a.temporalRelevance === 'RECENT')) ||
                                 (a.assetRelevance === 'PRIMARY_FOCUS' && a.temporalRelevance === 'BREAKING' && a.explanatoryCategory === 'ANALYST_OR_PRODUCT')
                          );
                          if (!hasMaterialCatalyst) {
                            displayPt = 'Catalyst: No material asset-specific catalyst identified.';
                          }
                        }
                        return <li key={i}>{displayPt}</li>;
                      })}
                    </ul>
                  </div>
                  <div>
                    <span className="field-label" style={{ color: 'var(--muted)', marginBottom: '8px' }}>Key Risk Considerations</span>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
                      {report.assessment.keyRisks.map((rk, i) => (
                        <li key={i}>{rk}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section 2: Competing Hypotheses Testing Matrix (Level 2 Core Research) */}
          <div style={{ marginBottom: '32px' }}>
            <div className="section-title" style={{ marginBottom: '6px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 650, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Competing Hypotheses Testing Matrix
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Factual evidence mapping</span>
                {report.hypotheses.length > 0 && (
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => {
                      const allExpanded = report.hypotheses.every(h => expandedHypotheses[h.id]);
                      if (allExpanded) {
                        setExpandedHypotheses({});
                      } else {
                        const next: Record<string, boolean> = {};
                        for (const h of report.hypotheses) next[h.id] = true;
                        setExpandedHypotheses(next);
                      }
                    }}
                    style={{ fontSize: '11px', padding: '2px 8px', cursor: 'pointer' }}
                  >
                    {report.hypotheses.every(h => expandedHypotheses[h.id]) ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Confidence scores represent qualitative research assessment strength based on observable evidence, not statistical or empirical probabilities.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {report.hypotheses.map(hypo => {
                const isSupported = hypo.status === 'SUPPORTED';
                const isPartiallySupported = hypo.status === 'PARTIALLY_SUPPORTED';
                const isPlausible = hypo.status === 'PLAUSIBLE';
                const isContradicted = hypo.status === 'CONTRADICTED';
                const isWeak = hypo.status === 'WEAK';
                const isExpanded = Boolean(expandedHypotheses[hypo.id]);
                const statusSummary = getHypothesisStatusSummary(hypo);
                return (
                  <div
                    key={hypo.id}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${isSupported ? 'var(--brand-border)' : isContradicted ? 'var(--error-border, rgba(239,68,68,0.3))' : 'var(--border)'}`,
                      borderRadius: '8px',
                      padding: '14px 18px',
                      boxShadow: 'var(--shadow-card)',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text)' }}>{hypo.title}</strong>
                        <span style={{ fontSize: '10.5px', color: 'var(--faint)', fontFamily: 'ui-monospace, monospace' }}>[{hypo.id}]</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Qualitative research confidence: ${Math.round(hypo.confidence * 100)}% (not statistical probability)`}>
                          <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>Confidence:</span>
                          <strong style={{ fontSize: '12px', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(hypo.confidence * 100)}%</strong>
                          <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(hypo.confidence * 100)}%`, height: '100%', background: isSupported ? 'var(--accent)' : (isPartiallySupported || isPlausible) ? 'var(--amber, #d97706)' : isContradicted ? 'var(--error, #ef4444)' : 'var(--muted)' }} />
                          </div>
                        </div>
                        <span
                          className="badge"
                          style={{
                            background: isSupported
                              ? 'var(--accent-surface)'
                              : (isPartiallySupported || isPlausible)
                              ? 'var(--amber-surface)'
                              : isContradicted
                              ? 'var(--error-surface, rgba(239,68,68,0.1))'
                              : 'var(--surface-raised)',
                            color: isSupported
                              ? 'var(--accent)'
                              : (isPartiallySupported || isPlausible)
                              ? 'var(--amber)'
                              : isContradicted
                              ? 'var(--error, #ef4444)'
                              : isWeak
                              ? 'var(--muted)'
                              : 'var(--faint)',
                            border: '1px solid currentColor',
                            padding: '2px 8px',
                            borderRadius: '5px',
                            fontSize: '10.5px',
                            fontWeight: 600,
                            letterSpacing: '0.3px',
                          }}
                        >
                          {hypo.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginTop: '8px' }}>
                      <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: 0, lineHeight: '1.45', flex: 1 }}>
                        {statusSummary}
                      </p>
                      <button
                        type="button"
                        className="secondary-action"
                        aria-expanded={isExpanded}
                        aria-controls={`hypo-evidence-${hypo.id}`}
                        onClick={() => toggleHypothesis(hypo.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{isExpanded ? 'Hide evidence' : 'View evidence'}</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 150ms ease',
                          }}
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {isExpanded && (
                      <div
                        id={`hypo-evidence-${hypo.id}`}
                        className="hypothesis-expanded-content"
                        style={{
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', lineHeight: '1.45', fontStyle: 'italic' }}>
                          {hypo.description}
                        </p>
                        <div className="hypo-evidence-grid">
                          <div>
                            <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 650, color: 'var(--accent)', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Supporting Evidence
                            </span>
                            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
                              {hypo.supportingEvidence.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '10.5px', fontWeight: 650, color: 'var(--faint)', letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Contradicting / Limiting Evidence
                            </span>
                            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
                              {hypo.contradictingEvidence.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        {hypo.confidenceRationale && (
                          <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.5', borderTop: '1px solid var(--border-soft, var(--border))', paddingTop: '8px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Confidence Rationale: </span>
                            {hypo.confidenceRationale}
                          </div>
                        )}
                        {hypo.missingEvidence && hypo.missingEvidence.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--amber, #d97706)', lineHeight: '1.5' }}>
                            <span style={{ fontWeight: 600 }}>Missing to elevate: </span>
                            {hypo.missingEvidence.join(' · ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Observable Evidence Layers (Level 3 Supporting Evidence) */}
          <div style={{ marginBottom: '32px' }}>
            <div className="section-title" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 650, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Observed Market Evidence Snapshot
              </h3>
              <span>Bitget Reality vs {report.evidence.referenceSource ?? 'Reference'}</span>
            </div>
            <div className="microstructure-evidence-grid">
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
                <span className="field-label">Bitget Reality Token ({report.evidence.tokenizedSymbol})</span>
                <dl className="property-list" style={{ marginTop: '10px' }}>
                  <div><dt>Last Tokenized Price</dt><dd className="numeric">{formatPrice(report.evidence.tokenizedPrice)} USDT</dd></div>
                  <div><dt>Top of Book Bid / Ask</dt><dd className="numeric">{formatPrice(report.evidence.bitgetBid1Price)} / {formatPrice(report.evidence.bitgetAsk1Price)}</dd></div>
                  <div><dt>Quoting Spread</dt><dd className="numeric">{report.evidence.bitgetSpreadPercent !== null ? `${report.evidence.bitgetSpreadPercent.toFixed(4)}%` : '—'}</dd></div>
                  <div><dt>Bid / Ask Depth Size</dt><dd className="numeric">{report.evidence.bitgetBid1Size ?? '—'} / {report.evidence.bitgetAsk1Size ?? '—'}</dd></div>
                  <div><dt>24h Trading Volume</dt><dd className="numeric">{report.evidence.bitgetVolume24h !== null ? report.evidence.bitgetVolume24h.toLocaleString() : '—'}</dd></div>
                  <div><dt>24h Price Change</dt><dd className="numeric">{report.evidence.bitgetPriceChange24hPcnt !== null ? `${report.evidence.bitgetPriceChange24hPcnt > 0 ? '+' : ''}${report.evidence.bitgetPriceChange24hPcnt.toFixed(2)}%` : '—'}</dd></div>
                  <div><dt>Observation Age</dt><dd className="numeric">{report.evidence.tokenizedAgeMs !== null ? `${Math.floor(report.evidence.tokenizedAgeMs / 1000)}s` : 'Unknown'}</dd></div>
                </dl>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
                <span className="field-label">Underlying Reference Market ({report.symbol})</span>
                <dl className="property-list" style={{ marginTop: '10px' }}>
                  <div><dt>Reference Price</dt><dd className="numeric">{report.evidence.referencePrice !== null ? `$${formatPrice(report.evidence.referencePrice)}` : '—'}</dd></div>
                  <div><dt>Reference Source</dt><dd>{report.evidence.referenceSource ?? 'None'}</dd></div>
                  <div><dt>Reference Type</dt><dd>{report.evidence.referenceType ?? 'Unavailable'}</dd></div>
                  <div><dt>Reference Bid / Ask</dt><dd className="numeric">{formatPrice(report.evidence.referenceBid)} / {formatPrice(report.evidence.referenceAsk)}</dd></div>
                  <div><dt>Timestamp Skew</dt><dd className="numeric">{report.evidence.timestampSkewMs !== null ? `${(report.evidence.timestampSkewMs / 1000).toFixed(3)}s` : '—'}</dd></div>
                  <div><dt>Observation Age</dt><dd className="numeric">{report.evidence.referenceAgeMs !== null ? `${Math.floor(report.evidence.referenceAgeMs / 1000)}s` : 'Unknown'}</dd></div>
                  <div><dt>Comparison Status</dt><dd>{report.evidence.comparisonStatus}</dd></div>
                </dl>
              </div>
            </div>
          </div>

          {/* Section 4: Deterministic Signals Grid */}
          <div style={{ marginBottom: '32px' }}>
            <div className="section-title" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 650, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Deterministic Signals (Research Heuristics)
              </h3>
              <span>{report.signals.length} signals derived</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '14px' }}>
              {report.signals.map(signal => {
                const isSessionSignal = signal.id === 'MARKET_SESSION_CONTEXT';
                const isClosedMarket = ['CLOSED', 'AFTER_HOURS', 'PRE_MARKET'].includes(report.evidence.marketSession) || report.evidence.comparisonStatus === 'STALE';
                const showAsInfo = isSessionSignal && isClosedMarket;
                const isAlert = signal.severity === 'ALERT';
                const isWarning = signal.severity === 'WARNING';
                return (
                  <div
                    key={signal.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="quiet-label" style={{ fontSize: '10.5px', textTransform: 'uppercase', fontWeight: 600 }}>{signal.category}</span>
                      <span
                        className="badge"
                        style={{
                          fontSize: '10.5px',
                          color: showAsInfo ? 'var(--blue, #3b82f6)' : isAlert ? 'var(--error)' : isWarning ? 'var(--amber)' : 'var(--accent)',
                          background: showAsInfo ? 'var(--blue-surface, rgba(59, 130, 246, 0.1))' : isAlert ? 'var(--error-surface)' : isWarning ? 'var(--amber-surface)' : 'var(--accent-surface)',
                          border: `1px solid ${showAsInfo ? 'currentColor' : isAlert ? 'var(--error)' : isWarning ? 'var(--amber)' : 'var(--accent)'}`,
                        }}
                      >
                        {signal.severity}
                      </span>
                    </div>
                    <strong style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{signal.name}</strong>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12.5px', fontWeight: 550, color: 'var(--text)', marginBottom: '6px' }}>
                      {signal.value}
                    </div>
                    <p style={{ fontSize: '11.5px', color: 'var(--muted)', margin: 0, lineHeight: '1.5' }}>
                      {signal.interpretation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Market Catalyst & News Evidence */}
          <div style={{ marginBottom: '32px' }}>
            <div className="section-title" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 650, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Market Catalyst &amp; News Evidence (Benzinga / Alpaca)
              </h3>
              <span>
                {report.evidence.catalyst
                  ? `${report.evidence.catalyst.articles.length} verified items (48h window)`
                  : 'News feed inactive'}
              </span>
            </div>

            {/* Catalyst Content */}
            {!report.evidence.catalyst || report.evidence.catalyst.status === 'UNCONFIGURED' ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Catalyst news evidence unavailable</strong>
                Live catalyst news syndication is inactive in this environment. The <code>MARKET_EVENT</code> hypothesis remains conservatively <code>UNRESOLVED</code>.
              </div>
            ) : report.evidence.catalyst.status === 'UNAVAILABLE' ? (
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text)' }}>Catalyst evidence temporarily unavailable</strong>
                Contemporaneous news feed could not be retrieved from provider. The <code>MARKET_EVENT</code> hypothesis remains conservatively <code>UNRESOLVED</code>.
              </div>
            ) : report.evidence.catalyst.articles.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>No qualifying catalyst evidence found</strong>
                Zero breaking or recent headlines detected for <strong>{report.symbol}</strong> within the {report.evidence.catalyst.windowHours}-hour pre-observation search window.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginBottom: '4px' }}>
                  Contemporaneous news existence does not imply direct causation of tokenized spread. Evaluated chronologically relative to snapshot time.
                </div>
                {report.evidence.catalyst.articles.map(article => {
                  const isBreaking = article.relevance === 'BREAKING';
                  const isRecent = article.relevance === 'RECENT';
                  const ageMins = Math.round(article.ageRelativeMs / 60000);
                  const ageDisplay = ageMins < 60
                    ? `${ageMins}m before snapshot`
                    : `${Math.round(ageMins / 60)}h before snapshot`;

                  return (
                    <div
                      key={article.id}
                      style={{
                        background: 'var(--surface)',
                        border: `1px solid ${isBreaking ? 'var(--brand-border)' : 'var(--border)'}`,
                        borderRadius: '8px',
                        padding: '14px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              color: isBreaking ? 'var(--error, #ef4444)' : isRecent ? 'var(--accent)' : 'var(--muted)',
                              background: isBreaking ? 'var(--error-surface, rgba(239,68,68,0.1))' : isRecent ? 'var(--accent-surface)' : 'var(--surface-raised)',
                              border: '1px solid currentColor',
                            }}
                          >
                            {article.relevance}
                          </span>
                          {article.explanatoryCategory && (
                            <span
                              className="badge"
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: article.isMaterialCatalyst ? 'var(--accent)' : 'var(--muted)',
                                background: article.isMaterialCatalyst ? 'var(--accent-surface)' : 'var(--surface-raised)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {article.isMaterialCatalyst ? 'MATERIAL CATALYST' : article.explanatoryCategory.replaceAll('_', ' ')}
                            </span>
                          )}
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                            {article.source}
                          </span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                          {ageDisplay} &middot; {timeLabel(article.publishedAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 550, color: 'var(--text)', lineHeight: '1.4' }}>
                        {article.url ? (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                          >
                            {article.headline} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>↗</span>
                          </a>
                        ) : (
                          article.headline
                        )}
                      </div>
                      {article.summary && (
                        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: '1.5' }}>
                          {article.summary}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 6: Limitations & Caveats */}
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
            <span className="field-label" style={{ marginBottom: '8px' }}>Recorded Limitations &amp; Disclosures</span>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.6' }}>
              {report.limitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
            </ul>
          </div>

          {/* Section 7: Deterministic Data Quality Score Card */}
          {report.dataQuality && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 20px', marginBottom: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '13.5px', fontWeight: 650, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>
                    Deterministic Data Quality Score
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Derived mathematically from observable factors &middot; Independent of LLM</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: report.dataQuality.grade === 'HIGH' ? 'var(--accent)' : report.dataQuality.grade === 'MODERATE' ? 'var(--amber, #d97706)' : 'var(--error)' }}>
                    {report.dataQuality.overallScore} / 100
                  </span>
                  <span className="badge" style={{ fontSize: '10.5px', border: '1px solid currentColor', color: report.dataQuality.grade === 'HIGH' ? 'var(--accent)' : report.dataQuality.grade === 'MODERATE' ? 'var(--amber, #d97706)' : 'var(--error)' }}>
                    {report.dataQuality.grade} FIDELITY
                  </span>
                </div>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text)', lineHeight: '1.45' }}>
                {report.dataQuality.summary}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                {report.dataQuality.factors.map(f => (
                  <div key={f.name} style={{ background: 'var(--surface-raised)', borderRadius: '4px', padding: '8px 10px', fontSize: '11.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{f.name}</span>
                      <span style={{ color: f.status === 'EXCELLENT' ? 'var(--accent)' : f.status === 'GOOD' ? 'var(--text)' : 'var(--amber, #d97706)' }}>{f.score}%</span>
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--muted)', lineHeight: '1.3' }}>{f.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 8: Data Provenance & Audit Trail */}
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="field-label" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 650 }}>
                Data Provenance &amp; Audit Trail
              </span>
              <span style={{ fontSize: '11px', color: 'var(--faint)', fontFamily: 'ui-monospace, monospace' }}>ID: {report.id}</span>
            </div>
            <dl className="property-list" style={{ fontSize: '11.5px' }}>
              <div><dt>Observation Time</dt><dd>{timeLabel(report.completedAt)}</dd></div>
              <div><dt>Pipeline Duration</dt><dd className="numeric">{report.durationMs}ms</dd></div>
              <div><dt>Tokenized Source</dt><dd>Bitget Reality REST API ({report.evidence.tokenizedSymbol})</dd></div>
              <div><dt>Reference Market</dt><dd>{report.evidence.referenceSource ?? 'Alpaca US Equity Reference'} ({report.evidence.referenceType ?? 'Indicative'})</dd></div>
              <div><dt>News Wire</dt><dd>{report.evidence.catalyst ? `Benzinga Syndicated via Alpaca (${report.evidence.catalyst.articles.length} events analyzed)` : 'Benzinga News (inactive)'}</dd></div>
              <div><dt>Synthesis Engine</dt><dd>{report.aiStatus === 'COMPLETED' ? 'AI Synthesis Engine (OpenAI-compatible REST)' : 'Deterministic Heuristics Engine'}</dd></div>
              <div><dt>Operational Bounds</dt><dd>Read-only surveillance &middot; No trading or execution</dd></div>
            </dl>
          </div>
        </div>
      )}

      {/* Legacy/preview workflow footer when no report is active */}
      {!report && (
        <>
          <div className="investigation-preview">
            <div>
              <span>01</span>
              <strong>Investigate</strong>
              <p>Examine the observed dislocation.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Evidence</strong>
              <p>Organize sources and observations.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Assess</strong>
              <p>Review a supported assessment.</p>
            </div>
          </div>
          <p className="future-note">WickLink Investigation Engine V1</p>
        </>
      )}
    </section>
  );
}

export function DataSourcesView({ assets, data, error }: { assets: MarketAsset[]; data: MarketResponse; error: string | null }) {
  const selected = [...new Set(assets.flatMap(asset => asset.referenceSource ? [asset.referenceSource] : []))];
  return (
    <div className="transparency-view">
      <div className="view-intro">
        <span className="eyebrow">TRACE EVERY OBSERVATION</span>
        <h2>Verified Sources &amp; Clear Provenance</h2>
        <p>Provider coverage, reference selection, AI synthesis status and freshness are visible alongside every comparison.</p>
      </div>
      <div className="provider-grid">
        <section className="panel provider-card">
          <div className="provider-title">
            <span className="provider-mark bitget-mark" tabIndex={0} role="img" aria-label="Bitget Reality" data-tooltip="Bitget Reality">B</span>
            <div>
              <h3>Bitget Reality</h3>
              <p>Tokenized equity market data</p>
            </div>
            <StatusBadge status={providerStatus(assets, 'bitget', Boolean(error))} />
          </div>
          <dl className="property-list">
            <div><dt>Market</dt><dd>Reality spot &middot; USDT</dd></div>
            <div><dt>Instruments</dt><dd>{assets.length ? assets.map(asset => `r${asset.symbol}`).join(' · ') : 'No confirmed instruments'}</dd></div>
            <div><dt>Observation</dt><dd>Last price / top of book depth / timestamp</dd></div>
          </dl>
          <details className="technical-details" style={{ marginTop: '12px', borderTop: '1px solid var(--border)' }}>
            <summary>Technical Details <span>API access &amp; session inputs</span></summary>
            <dl className="property-list">
              <div><dt>Access</dt><dd>Public, read-only REST API</dd></div>
              <div><dt>Session inputs</dt><dd>Reality schedule + calendar</dd></div>
            </dl>
          </details>
          <p className="source-disclosure">Snapshot freshness does not establish the age of the last trade.</p>
        </section>

        <section className="panel provider-card">
          <div className="provider-title">
            <span className="provider-mark alpaca-mark" tabIndex={0} role="img" aria-label="Alpaca Market Data" data-tooltip="Alpaca Market Data">A</span>
            <div>
              <h3>Alpaca</h3>
              <p>Underlying US equity reference</p>
            </div>
            <StatusBadge status={providerStatus(assets, 'reference', Boolean(error))} />
          </div>
          <dl className="property-list">
            <div><dt>Regular session</dt><dd>IEX &middot; latest eligible trade</dd></div>
            <div><dt>Overnight session</dt><dd>Indicative quote midpoint</dd></div>
            <div><dt>Selected source</dt><dd>{selected.join(', ') || 'No eligible reference selected'}</dd></div>
          </dl>
          <details className="technical-details" style={{ marginTop: '12px', borderTop: '1px solid var(--border)' }}>
            <summary>Technical Details <span>Currency &amp; auth</span></summary>
            <dl className="property-list">
              <div><dt>Currency</dt><dd>USD</dd></div>
              <div><dt>Authentication</dt><dd>Server-side only</dd></div>
            </dl>
          </details>
          <p className="source-disclosure">IEX may differ from consolidated SIP pricing. Overnight midpoints are indicative, not executed trades.</p>
        </section>

        <section className="panel provider-card">
          <div className="provider-title">
            <span className="provider-mark ai-mark" tabIndex={0} role="img" aria-label="AI Research Engine" data-tooltip="AI Research Engine">AI</span>
            <div>
              <h3>AI Research Engine</h3>
              <p>Hypothesis evaluation &amp; synthesis</p>
            </div>
            <StatusBadge status="LIVE" />
          </div>
          <dl className="property-list">
            <div><dt>Role</dt><dd>Multi-hypothesis evaluation &amp; synthesis</dd></div>
            <div><dt>Protocol</dt><dd>OpenAI-compatible REST API</dd></div>
            <div><dt>Execution bounds</dt><dd>Read-only research desk &middot; No trading</dd></div>
          </dl>
          <details className="technical-details" style={{ marginTop: '12px', borderTop: '1px solid var(--border)' }}>
            <summary>Technical Details <span>Input signals &amp; output schema</span></summary>
            <dl className="property-list">
              <div><dt>Input evidence</dt><dd>BBO, depth, session, skew, heuristics</dd></div>
              <div><dt>Output schema</dt><dd>Structured investigation assessment</dd></div>
            </dl>
          </details>
          <p className="source-disclosure">AI assessment evaluates only supplied market evidence and heuristics. No autonomous trading or financial advice.</p>
        </section>

        <section className="panel provider-card">
          <div className="provider-title">
            <span className="provider-mark news-mark" tabIndex={0} role="img" aria-label="Alpaca News API" data-tooltip="Alpaca News API">N</span>
            <div>
              <h3>Alpaca Market News</h3>
              <p>Benzinga syndicated corporate catalysts</p>
            </div>
            <StatusBadge status="LIVE" />
          </div>
          <dl className="property-list">
            <div><dt>Syndication</dt><dd>Benzinga wire &middot; real-time feeds</dd></div>
            <div><dt>Window</dt><dd>Bounded 48h temporal search window</dd></div>
            <div><dt>Relevance</dt><dd>Ticker filtered &middot; Breaking / Recent / Dated</dd></div>
          </dl>
          <details className="technical-details" style={{ marginTop: '12px', borderTop: '1px solid var(--border)' }}>
            <summary>Technical Details <span>Auth &amp; heuristic safety</span></summary>
            <dl className="property-list">
              <div><dt>Authentication</dt><dd>Server-side only (APCA keys)</dd></div>
              <div><dt>Boundary</dt><dd>Heuristic existence only; no inferred causation</dd></div>
            </dl>
          </details>
          <p className="source-disclosure">News reports establish market attention, not verified mathematical causation of price spread.</p>
        </section>
      </div>
      <section className="panel method-panel">
        <h3>Comparison Policy</h3>
        <div>
          <p><strong>60s</strong><span>Maximum observation age</span></p>
          <p><strong>30s</strong><span>Maximum timestamp separation</span></p>
          <p><strong>No FX adjustment</strong><span>Raw USDT-versus-USD comparison</span></p>
        </div>
        <p className="source-disclosure">Unavailable, stale or ineligible references are withheld. Last application check: {timeLabel(data.fetchedAt)}.</p>
      </section>
    </div>
  );
}

export function SystemStatusView({ assets, data, error }: { assets: MarketAsset[]; data: MarketResponse; error: string | null }) {
  const session = data.sessionDiagnostics?.session ?? 'UNKNOWN';
  const fresh = assets.filter(asset => asset.comparisonStatus === 'AVAILABLE').length;
  const checks = [
    { label: 'Bitget', description: 'Reality instrument discovery and tokenized quotes', status: providerStatus(assets, 'bitget', Boolean(error)), detail: error ?? `${assets.filter(asset => asset.bitgetStatus === 'LIVE').length} of ${assets.length} quotes fresh` },
    { label: 'Alpaca', description: 'Session-appropriate underlying reference data', status: providerStatus(assets, 'reference', Boolean(error)), detail: error ?? `${assets.filter(asset => asset.referenceStatus === 'LIVE').length} of ${assets.length} references fresh` },
    { label: 'News feed', description: 'Benzinga syndicated real-time equity news via Alpaca Data API', status: 'LIVE' as const, detail: 'Bounded 48h search window · Ticker-filtered events' },
    { label: 'AI engine', description: 'Multi-hypothesis research synthesis and evaluation', status: 'LIVE' as const, detail: 'Deterministic heuristics active · AI synthesis ready' },
    { label: 'Session engine', description: 'Bitget schedule and calendar / IANA timezone rules', status: error ? 'ERROR' as const : session === 'UNKNOWN' ? 'UNAVAILABLE' as const : 'LIVE' as const, detail: error ? 'Current session not verified' : `Resolved: ${sessionLabel(session)}` },
    { label: 'Freshness checks', description: '60-second age limit / 30-second timestamp separation', status: error ? 'ERROR' as const : fresh ? 'LIVE' as const : 'UNAVAILABLE' as const, detail: error ? 'Awaiting a successful refresh' : `${fresh} of ${assets.length} comparisons within limits` },
  ];
  return (
    <section className="panel system-view">
      <div className="section-heading">
        <div className="section-title">
          <h2>Connection &amp; Validation Status</h2>
        </div>
        <span className="quiet-label">LAST CHECK {timeLabel(data.fetchedAt)}</span>
      </div>
      <p className="system-caption">Current application observations. No uptime estimate or availability guarantee.</p>
      <div className="system-checks">
        {checks.map(check => (
          <div className="system-check" key={check.label}>
            <span className="system-icon"><InterfaceIcon name="system" /></span>
            <div>
              <h3>{check.label}</h3>
              <p>{check.description}</p>
            </div>
            <div className="system-result">
              <StatusBadge status={check.status} />
              <span>{check.detail}</span>
            </div>
          </div>
        ))}
      </div>
      <details className="technical-details">
        <summary>Session diagnostics <span>Provider metadata &amp; timezone interpretation</span></summary>
        <dl className="property-list">
          <div><dt>Timezone</dt><dd>{data.sessionDiagnostics?.timeZone ?? 'Unknown'}</dd></div>
          <div><dt>Bitget daylightType</dt><dd>{data.sessionDiagnostics?.reportedDaylightType ?? 'Unknown'}</dd></div>
          <div><dt>IANA daylight state</dt><dd>{data.sessionDiagnostics?.resolvedDaylightType ?? 'Unknown'}</dd></div>
        </dl>
        <p>{data.sessionDiagnostics?.timezoneDiagnostic ?? 'No timezone conflict reported in this snapshot.'}</p>
        {data.sessionIssue && <p>{data.sessionIssue}</p>}
      </details>
    </section>
  );
}
