'use client';

import InterfaceIcon from './InterfaceIcon';
import type { ReactNode } from 'react';
import { WickLinkMark } from './WickLinkLogo';
import type { WorkspaceView } from './workspace-state';

const primaryDestinations: { view: WorkspaceView; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'markets', label: 'Markets' },
  { view: 'investigations', label: 'Investigations' },
  { view: 'sources', label: 'Methodology' },
];

export default function Navigation({
  view,
  onNavigate,
  isOpen,
  onClose,
  status,
  freshness,
  refreshControl,
}: {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  isOpen?: boolean;
  onClose?: () => void;
  status?: ReactNode;
  freshness?: ReactNode;
  refreshControl?: ReactNode;
}) {
  const handleSelect = (targetView: WorkspaceView) => {
    onNavigate(targetView);
    onClose?.();
  };

  return (
    <aside
      id="navigation-drawer"
      className={`sidebar nav-drawer ${isOpen ? 'is-open' : ''}`}
      aria-label="Main navigation"
      role="dialog"
      aria-modal={isOpen || undefined}
      aria-hidden={!isOpen}
    >
      {/* Brand Header */}
      <div className="brand-wrap">
        <button
          type="button"
          className="brand brand-button"
          aria-label="WickLink Overview"
          onClick={() => handleSelect('overview')}
        >
          <div className="brand-logo-icon">
            <WickLinkMark size={20} />
          </div>
          <div className="brand-text">
            <span className="brand-name">WICKLINK</span>
            <span className="brand-subtitle">Market Intelligence</span>
          </div>
        </button>
        {onClose && (
          <button
            type="button"
            className="drawer-close-btn"
            aria-label="Close navigation drawer"
            onClick={onClose}
          >
            <InterfaceIcon name="close" />
          </button>
        )}
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
              onClick={() => handleSelect(item.view)}
            >
              <InterfaceIcon name={item.view} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

      </nav>
      <div className="drawer-status">
        {status}
        <button type="button" className="drawer-system-link" aria-label="System Status" data-tooltip="System Status" onClick={() => handleSelect('system')}>System Status</button>
        {freshness}
        {refreshControl}
      </div>
    </aside>
  );
}
