'use client';

import React from 'react';

interface MiniSparklineProps {
  symbol: string;
  points?: number[] | null;
  loading?: boolean;
}

export default function MiniSparkline({
  symbol,
  points,
  loading = false,
}: MiniSparklineProps) {
  if (loading) {
    return (
      <span
        className="sparkline-wrap sparkline-loading"
        aria-label={`Loading 12-hour trend for ${symbol}`}
        role="img"
      >
        <span className="sparkline-skeleton" />
      </span>
    );
  }

  if (!points || points.length < 2) {
    return (
      <span
        className="sparkline-wrap sparkline-unavailable"
        aria-label={`12-hour trend unavailable for ${symbol}`}
        role="img"
        title="12h historical trend unavailable"
      >
        <span className="sparkline-empty-dash">—</span>
      </span>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 56;
  const height = 18;
  const padding = 2;

  // Build SVG path
  const coords = points.map((val, idx) => {
    const x = padding + (idx / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const first = points[0];
  const last = points[points.length - 1];
  const isUp = last >= first;
  const strokeColor = isUp ? 'var(--accent)' : 'var(--error, #ef4444)';
  const percentChange = first !== 0 ? (((last - first) / first) * 100).toFixed(2) : '0.00';

  return (
    <span
      className={`sparkline-wrap ${isUp ? 'trend-up' : 'trend-down'}`}
      aria-label={`12h Reality token trend: ${isUp ? '+' : ''}${percentChange}%`}
      role="img"
      title={`12h Reality token trend: ${isUp ? '+' : ''}${percentChange}%`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        aria-hidden="true"
        className="sparkline-svg"
      >
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle end-point dot */}
        <circle
          cx={coords[coords.length - 1].split(',')[0]}
          cy={coords[coords.length - 1].split(',')[1]}
          r="1.8"
          fill={strokeColor}
        />
      </svg>
    </span>
  );
}

