import { normalizeTrades } from './normalize.ts';
import { REFERENCE_SYMBOLS } from '../market/symbols.ts';
import type { ReferenceResult } from './types.ts';
import { normalizeQuotes } from './quotes.ts';

// Pure transport seam for offline tests. Production calls only through server-only client.ts.
export async function requestReference(
  credentials: { key: string | undefined; secret: string | undefined },
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  feed: 'iex' | 'overnight' = 'iex',
  symbols: readonly string[] = REFERENCE_SYMBOLS,
): Promise<ReferenceResult> {
  if (!credentials.key?.trim() || !credentials.secret?.trim()) {
    return { trades: [], status: 'UNAVAILABLE', issue: 'Underlying reference unavailable: Alpaca credentials are not configured.' };
  }
  try {
    const url = new URL(`https://data.alpaca.markets/v2/stocks/${feed === 'overnight' ? 'quotes' : 'trades'}/latest`);
    url.search = new URLSearchParams({ symbols: symbols.join(','), feed, currency: 'USD' }).toString();
    const response = await fetcher(url, {
      method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'APCA-API-KEY-ID': credentials.key.trim(), 'APCA-API-SECRET-KEY': credentials.secret.trim() },
    });
    if (!response.ok) {
      // Never return upstream bodies, headers, or exception text: they could contain secrets.
      return { trades: [], feed, httpStatus: response.status, status: 'ERROR', issue: `Underlying reference unavailable: Alpaca ${feed} HTTP ${response.status}.` };
    }
    const trades = (feed === 'overnight' ? normalizeQuotes : normalizeTrades)(await response.json(), symbols, now());
    const status = trades.some(trade => trade.status === 'UNAVAILABLE') ? 'UNAVAILABLE' : trades.some(trade => trade.status === 'DELAYED') ? 'DELAYED' : 'LIVE';
    return { trades, feed, httpStatus: response.status, status, issue: null };
  } catch {
    return { trades: [], status: 'ERROR', issue: 'Underlying reference unavailable: Alpaca request failed or returned invalid data.' };
  }
}
