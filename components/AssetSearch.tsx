'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { MarketAsset } from '@/lib/bitget/types';
import { formatPrice } from '@/lib/market/presentation';
import { displayPercent } from './ui-format';
import InterfaceIcon from './InterfaceIcon';

export default function AssetSearch({
  assets,
  onSelect,
}: {
  assets: MarketAsset[];
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanQuery = query.trim().toLowerCase();

  const filtered = cleanQuery
    ? assets.filter(
        a =>
          a.symbol.toLowerCase().includes(cleanQuery) ||
          a.displayName.toLowerCase().includes(cleanQuery) ||
          a.tokenizedSymbol.toLowerCase().includes(cleanQuery)
      )
    : assets.slice(0, 6);

  // Close on outside click or tap
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Global keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const selectAsset = useCallback((symbol: string) => {
    onSelect(symbol);
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        setActiveIndex(prev => (prev + 1) % filtered.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        setActiveIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && filtered[activeIndex]) {
        selectAsset(filtered[activeIndex].symbol);
      }
    }
  };

  return (
    <div className="search-wrap" ref={containerRef}>
      <div className={`header-search-box ${isOpen ? 'focused' : ''}`}>
        <InterfaceIcon name="search" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search tokenized assets, tickers..."
          aria-label="Search tokenized assets and tickers"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-dropdown-menu"
        />
        {query ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            &times;
          </button>
        ) : (
          <kbd className="search-shortcut-badge">⌘ K</kbd>
        )}
      </div>

      {isOpen && (
        <div id="search-dropdown-menu" className="search-dropdown" role="listbox">
          <div className="search-dropdown-header">
            <span>{cleanQuery ? `Matching Assets (${filtered.length})` : 'Monitored Assets'}</span>
            <span className="search-hint">↑↓ navigate &middot; ↵ select &middot; esc close</span>
          </div>

          {filtered.length === 0 ? (
            <div className="search-empty-state">
              <strong>No monitored assets found for &ldquo;{query}&rdquo;</strong>
              <p>Only verified Bitget Reality instruments with underlying references appear in search.</p>
            </div>
          ) : (
            <ul className="search-results-list">
              {filtered.map((asset, index) => {
                const isSelected = index === activeIndex;
                const isPositive = (asset.rawDislocationPercent ?? 0) > 0;
                const isNegative = (asset.rawDislocationPercent ?? 0) < 0;

                return (
                  <li
                    key={asset.symbol}
                    role="option"
                    aria-selected={isSelected}
                    className={`search-result-item ${isSelected ? 'active' : ''}`}
                    onClick={() => selectAsset(asset.symbol)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      selectAsset(asset.symbol);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className={`asset-monogram asset-monogram-${asset.symbol.toLowerCase()}`}>
                      {asset.symbol.slice(0, 2)}
                    </div>
                    <div className="search-item-info">
                      <div className="search-item-symbol-row">
                        <strong className="search-item-symbol">{asset.symbol}</strong>
                        <span className="search-item-name">{asset.displayName}</span>
                      </div>
                      <span className="search-item-tokenized">{asset.tokenizedSymbol} &middot; Bitget Reality</span>
                    </div>
                    <div className="search-item-metrics">
                      <span className="numeric search-item-price">
                        {asset.tokenizedPrice !== null ? `${formatPrice(asset.tokenizedPrice)} USDT` : '—'}
                      </span>
                      {asset.rawDislocationPercent !== null ? (
                        <span
                          className={`search-item-dislocation ${
                            isPositive ? 'diff-positive' : isNegative ? 'diff-negative' : 'diff-flat'
                          }`}
                        >
                          {displayPercent(asset.rawDislocationPercent)}
                        </span>
                      ) : (
                        <span className="search-item-dislocation diff-flat">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
