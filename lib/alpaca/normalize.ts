import { isRecord } from '../bitget/normalize.ts';
import { ageInMilliseconds, MAX_PRICE_AGE_MS } from '../market/policy.ts';
import type { ReferenceTrade } from './types.ts';

// p and t are documented Alpaca trade fields. Feed/currency are explicit request metadata.
export function normalizeTrades(body: unknown, symbols: readonly string[], now: number): ReferenceTrade[] {
  if (!isRecord(body) || !isRecord(body.trades)) throw new Error('Invalid Alpaca trades response.');
  const trades = body.trades;
  return symbols.map(symbol => {
    const raw = trades[symbol];
    const price = isRecord(raw) && typeof raw.p === 'number' && Number.isFinite(raw.p) && raw.p > 0 ? raw.p : null;
    const timestamp = isRecord(raw) && typeof raw.t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(raw.t) && ageInMilliseconds(raw.t, now) !== null ? raw.t : null;
    const age = ageInMilliseconds(timestamp, now);
    return {
      symbol, price, timestamp, feed: 'iex', currency: 'USD',
      status: price === null || age === null ? 'UNAVAILABLE' : age > MAX_PRICE_AGE_MS ? 'DELAYED' : 'LIVE',
    };
  });
}
