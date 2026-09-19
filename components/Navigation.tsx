'use client';

import InterfaceIcon from './InterfaceIcon';
import ThemeToggle from './ThemeToggle';
import { WickLinkMark } from './WickLinkLogo';
import type { WorkspaceView } from './workspace-state';

const primaryDestinations: { view: WorkspaceView; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'markets', label: 'Markets' },
  { view: 'investigations', label: 'Investigations' },
  { view: 'sources', label: 'Data Sources' },
];

const utilityDestinations: { view: WorkspaceView; label: string }[] = [
  { view: 'system', label: 'System Status' },
];

export default function Navigation({
  view,
  onNavigate,
}: {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="brand-wrap">
        <button
          type="button"
          className="brand brand-button"
          aria-label="WickLink Overview"
          data-tooltip="Overview"
          onClick={() => onNavigate('overview')}
        >
          <div className="brand-logo-icon">
            <WickLinkMark size={20} />
          </div>
          <div className="brand-text">
            <span className="brand-name">WickLink</span>
            <span className="brand-badge">find the weak link in the market.</span>
          </div>
        </button>
      </div>

      {/* Main Navigation */}
      <nav aria-label="Main navigation" className="sidebar-nav">
        <div className="nav-group primary-nav">
          {primaryDestinations.map(item => (
            <button
              key={item.view}
              aria-label={item.label}
              data-tooltip={item.label}
              className={`nav-item ${view === item.view ? 'active' : ''}`}
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <InterfaceIcon name={item.view} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* System & Utility Navigation */}
        <div className="nav-group utility-nav">
          {utilityDestinations.map(item => (
            <button
              key={item.view}
              aria-label={item.label}
              data-tooltip={item.label}
              className={`nav-item ${view === item.view ? 'active' : ''}`}
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <InterfaceIcon name={item.view} />
              <span>{item.label}</span>
            </button>
          ))}

          <div className="theme-toggle-wrap">
            <ThemeToggle />
          </div>

          {/* Operational Status Card from Mockup */}
          <div className="sidebar-operational-card">
            <div className="op-status-row">
              <span className="op-status-dot" />
              <strong className="op-status-title">All Systems Operational</strong>
            </div>
            <span className="op-status-sub">Live market data &middot; 15s</span>
          </div>
        </div>
      </nav>
    </aside>
  );
}
