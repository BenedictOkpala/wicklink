import { isRecord } from '../bitget/normalize.ts';
import { normalizeTrades } from './normalize.ts';
import type { ReferenceTrade } from './types.ts';

export function normalizeQuotes(body: unknown, symbols: readonly string[], now: number): ReferenceTrade[] {
  if (!isRecord(body) || !isRecord(body.quotes) || Array.isArray(body.quotes)) throw new Error('Invalid quotes envelope.');
  const quotes = body.quotes;
  return symbols.map(symbol => {
    const raw = quotes[symbol];
    const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
    const bidPrice = isRecord(raw) ? positive(raw.bp) : null;
    const askPrice = isRecord(raw) ? positive(raw.ap) : null;
    const midpoint = bidPrice !== null && askPrice !== null && bidPrice <= askPrice ? bidPrice / 2 + askPrice / 2 : null;
    // Reuse strict price/time validation; t is the single quote timestamp, not separate side timestamps.
    const normalized = normalizeTrades({ trades: { [symbol]: { p: midpoint, t: isRecord(raw) ? raw.t : null } } }, [symbol], now)[0];
    return { ...normalized, feed: 'overnight', referenceType: 'INDICATIVE_MIDPOINT', bidPrice, askPrice };
  });
}
