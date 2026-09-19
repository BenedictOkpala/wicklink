export type MarketSession = 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'OVERNIGHT' | 'CLOSED' | 'UNKNOWN';

export function normalizeSession(value: unknown): MarketSession {
  if (typeof value !== 'string') return 'UNKNOWN';
  const state = value.toUpperCase();
  return ['PRE_MARKET', 'REGULAR', 'AFTER_HOURS', 'OVERNIGHT', 'CLOSED'].includes(state) ? state as MarketSession : 'UNKNOWN';
}

// Legacy schedule-only adapter retained for compatibility. Without a calendar and
// injected UTC timestamp, a schedule alone still cannot establish current availability.
// Runtime Stage 2.6 uses resolveSession with all three inputs instead.
export function parseBitgetSession(_body: unknown): { session: MarketSession; issue: string } {
  void _body;
  return { session: 'UNKNOWN', issue: 'Session resolution requires the Bitget calendar and an injected UTC timestamp.' };
}
