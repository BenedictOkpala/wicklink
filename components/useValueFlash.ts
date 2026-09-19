'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hook to detect genuine numeric price or dislocation changes.
 * Returns:
 * - 'up' if the value increased
 * - 'down' if the value decreased
 * - null if the value is unchanged, initial mount, or withheld/stale
 *
 * Automatically resets back to null after `durationMs` (default 750ms).
 * Only triggers if the formatted representation actually changes, preventing
 * animations on sub-penny floating-point noise.
 * Also resets without animating if the inspected asset symbol changes.
 */
export function useValueFlash(
  symbol: string | undefined,
  value: number | null,
  formatFn: (v: number | null) => string,
  durationMs = 750
): 'up' | 'down' | null {
  const prevSymbolRef = useRef<string | undefined>(symbol);
  const prevValueRef = useRef<number | null>(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    // If the asset symbol changed (e.g. user selected another asset),
    // update refs without triggering any animation
    if (prevSymbolRef.current !== symbol) {
      prevSymbolRef.current = symbol;
      prevValueRef.current = value;
      setFlash(null);
      return;
    }

    const prevVal = prevValueRef.current;
    prevValueRef.current = value;

    // Both previous and current must be valid numbers
    if (prevVal !== null && value !== null) {
      const formattedPrev = formatFn(prevVal);
      const formattedCurr = formatFn(value);

      // Only trigger if the displayed formatted string actually changed
      if (formattedPrev !== formattedCurr) {
        const dir = value > prevVal ? 'up' : 'down';
        setFlash(dir);
        const timer = setTimeout(() => {
          setFlash(null);
        }, durationMs);
        return () => clearTimeout(timer);
      }
    }
  }, [symbol, value, formatFn, durationMs]);

  return flash;
}

/**
 * Pure calculation helper for change direction (for testing & non-hook use).
 */
export function detectValueChangeDirection(
  prevValue: number | null,
  newValue: number | null,
  formatFn: (v: number | null) => string
): 'up' | 'down' | null {
  if (prevValue === null || newValue === null) return null;
  const formattedPrev = formatFn(prevValue);
  const formattedCurr = formatFn(newValue);
  if (formattedPrev === formattedCurr) return null;
  return newValue > prevValue ? 'up' : 'down';
}
