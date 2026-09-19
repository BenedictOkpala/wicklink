import React from 'react';

export interface WickLinkMarkProps {
  size?: number;
  className?: string;
  /**
   * 'primary' uses White + WickLink Green (#22c55e / #16a34a) for dark tiles/surfaces.
   * 'light' uses Dark (#111827) + WickLink Green for bare white/light surfaces.
   */
  variant?: 'primary' | 'light';
  style?: React.CSSProperties;
}

/**
 * WickLink Mark: Two geometric chain links pulling away from each other,
 * with the connection in the centre appearing strained / partially broken.
 * Transparent background, scalable SVG.
 */
export function WickLinkMark({
  size = 32,
  className = '',
  variant = 'primary',
  style,
}: WickLinkMarkProps) {
  const link1Color = variant === 'light' ? 'var(--text, #111827)' : '#FFFFFF';
  const link2Color = variant === 'light' ? 'var(--accent, #16a34a)' : '#22c55e';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="WickLink mark"
      role="img"
    >
      <g transform="rotate(-45 16 16)">
        {/* Link 1: Reference link pulling bottom-left */}
        <path
          d="M13.5 12H9C6.79086 12 5 13.7909 5 16C5 18.2091 6.79086 20 9 20H17.5C18.3284 20 19 19.3284 19 18.5V17"
          stroke={link1Color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Link 2: Tokenized link pulling top-right under tension, visibly separated at center */}
        <path
          d="M13 15V13.5C13 12.6716 13.6716 12 14.5 12H23C25.2091 12 27 13.7909 27 16C27 18.2091 25.2091 20 23 20H18.5"
          stroke={link2Color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export interface WickLinkWordmarkProps {
  markSize?: number;
  showTagline?: boolean;
  className?: string;
  variant?: 'primary' | 'light';
  style?: React.CSSProperties;
}

/**
 * WickLink Wordmark / Lockup:
 * Mark inside brand container + "WickLink" name + tagline "find the weak link in the market."
 */
export function WickLinkWordmark({
  markSize = 20,
  showTagline = true,
  className = '',
  variant = 'primary',
  style,
}: WickLinkWordmarkProps) {
  return (
    <div
      className={`wicklink-lockup ${className}`}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', ...style }}
    >
      <div className="brand-logo-icon" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
        <WickLinkMark size={markSize} variant={variant} />
      </div>
      <div className="brand-text" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="brand-name">WickLink</span>
        {showTagline && (
          <span className="brand-badge">find the weak link in the market.</span>
        )}
      </div>
    </div>
  );
}

export default WickLinkMark;

