'use client';

import React from 'react';
import type { MarketAsset } from '@/lib/bitget/types';
import { formatPrice } from '@/lib/market/presentation';
import { displayPercent } from './ui-format';

interface IntelligenceStripProps {
  assets: MarketAsset[];
  onSelect?: (symbol: string) => void;
}

export default function IntelligenceStrip({ assets, onSelect }: IntelligenceStripProps) {
  if (!assets || assets.length === 0) return null;

  // Filter or take all 14 reality assets
  const items = assets.map((asset) => {
    const isAvailable = asset.comparisonStatus === 'AVAILABLE';
    const isStale = asset.comparisonStatus === 'STALE' || asset.isIndicativeOnly;
    const diffVal = isAvailable ? asset.rawDislocationPercent : asset.indicativeGapPercent;
    const isPositive = (diffVal ?? 0) > 0;
    const isNegative = (diffVal ?? 0) < 0;

    let tag = 'WITHHELD';
    if (isAvailable && diffVal !== null) {
      tag = asset.dislocationDirection?.toUpperCase() ?? 'DISLOCATION';
    } else if (isStale && diffVal !== null) {
      tag = 'INDICATIVE';
    }

    return {
      symbol: asset.symbol,
      price: asset.tokenizedPrice !== null ? formatPrice(asset.tokenizedPrice) : '—',
      diffStr: displayPercent(diffVal),
      isPositive,
      isNegative,
      tag,
    };
  });

  // Double the list for seamless continuous infinite scroll
  const displayList = [...items, ...items];

  return (
    <div
      className="intelligence-ticker-wrapper"
      role="region"
      aria-label="Live Market Intelligence Ticker"
    >
      <div className="ticker-badge" aria-hidden="true">
        <span className="ticker-live-dot" />
        <span className="ticker-badge-text">SURVEILLANCE</span>
      </div>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {displayList.map((item, idx) => (
            <button
              key={`${item.symbol}-${idx}`}
              type="button"
              className="ticker-item"
              onClick={() => onSelect?.(item.symbol)}
              aria-label={`View ${item.symbol}: $${item.price} (${item.diffStr} ${item.tag})`}
            >
              <strong className="ticker-symbol">{item.symbol}</strong>
              <span className="ticker-price">${item.price}</span>
              <span
                className={`ticker-diff ${
                  item.isPositive ? 'diff-up' : item.isNegative ? 'diff-down' : 'diff-neutral'
                }`}
              >
                {item.diffStr}
              </span>
              <span className={`ticker-tag tag-${item.tag.toLowerCase()}`}>
                {item.tag}
              </span>
              <span className="ticker-bullet" aria-hidden="true">&bull;</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

