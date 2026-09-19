import type { ReferenceResult } from '../alpaca/types.ts';
import type { MarketSession } from './session.ts';

export function selectReference(
  session: MarketSession,
  iex: ReferenceResult,
  overnight: ReferenceResult,
  options?: { allowContext?: boolean }
): ReferenceResult {
  if (session === 'REGULAR') {
    return { ...iex, feed: 'iex', trades: iex.trades.filter(trade => trade.feed === 'iex') };
  }
  if (session === 'OVERNIGHT') {
    return { ...overnight, feed: 'overnight', trades: overnight.trades.filter(trade => trade.feed === 'overnight') };
  }

  if (options?.allowContext) {
    const contextTrades = iex.trades.length > 0 ? iex.trades : overnight.trades;
    if (contextTrades.length > 0) {
      const feed = iex.trades.length > 0 ? 'iex' : 'overnight';
      return {
        status: 'DELAYED',
        feed,
        trades: contextTrades.map(trade => ({ ...trade, status: 'DELAYED' as const })),
        issue: `Reference market closed (session: ${session}). Last available reference retained for indicative gap context only.`,
      };
    }
  }

  return { trades: [], status: 'UNAVAILABLE', issue: `No verified reference strategy for US session ${session}. Comparison withheld.` };
}
