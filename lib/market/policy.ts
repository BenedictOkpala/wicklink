// Conservative monitoring policy, not an assertion of simultaneous execution.
export const MAX_PRICE_AGE_MS = 60_000;
export const MAX_TIMESTAMP_SKEW_MS = 30_000;
export const FUTURE_TOLERANCE_MS = 5_000;

export function ageInMilliseconds(timestamp: string | null, now: number): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > now + FUTURE_TOLERANCE_MS) return null;
  return Math.max(0, now - parsed);
}
