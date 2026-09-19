import type { MarketResponse } from '@/lib/bitget/types';
import { timeLabel, sessionLabel } from './ui-format';

export default function ActivityPanel({ data, error }: { data: MarketResponse; error: string | null }) {
  const comparable = data.assets.filter(asset => asset.comparisonStatus === 'AVAILABLE' && asset.rawDislocationPercent !== null);
  const sources = [...new Set(data.assets.flatMap(asset => asset.referenceSource ? [asset.referenceSource] : []))];
  const events = [
    { message: 'Market snapshot received', detail: `${data.assets.length} confirmed Reality instruments`, timestamp: data.fetchedAt },
    { message: `Session resolved: ${sessionLabel(data.sessionDiagnostics?.session ?? data.assets[0]?.marketSession)}`, detail: 'Bitget schedule + calendar', timestamp: data.sessionDiagnostics?.evaluatedAt ?? data.fetchedAt },
    { message: sources.length ? `Reference selected: ${sources.join(', ')}` : 'Reference not selected', detail: sources.length ? 'Provider observation timestamps preserved' : 'No eligible reference in this snapshot', timestamp: data.fetchedAt },
    { message: comparable.length ? `Dislocations calculated: ${comparable.length}` : 'Comparisons withheld', detail: comparable.length ? `${comparable.map(asset => asset.symbol).join(' · ')} passed freshness checks` : 'See asset status for data availability', timestamp: data.fetchedAt },
  ];
  return <section className="activity-panel panel" aria-labelledby="activity-title"><div className="section-heading"><h2 id="activity-title">ACTIVITY</h2><span className="quiet-label">SYSTEM EVENTS</span></div>
    <p className="activity-caption">Observable data events for the last snapshot.</p>
    {error && <p className="activity-error" role="status">Connection interrupted. Showing the last received event snapshot.</p>}
    <ol className="event-list">{events.map((event, index) => <li key={index}><span className={`event-point ${index === 0 ? 'latest' : ''}`} aria-hidden="true"/><div><time>{timeLabel(event.timestamp)}</time><p>{event.message}</p><span>{event.detail}</span></div></li>)}</ol>
    <div className="activity-footer">No investigation agent is running.</div>
  </section>;
}
