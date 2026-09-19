import type { Instrument, MarketAsset, Ticker } from './types.ts';
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
export function parseInstruments(data: unknown): Instrument[] {
  if (!Array.isArray(data)) throw new Error('Invalid instruments response.');
  return data.filter((item): item is Instrument => isRecord(item) && ['symbol','baseCoin','quoteCoin','status','isReality'].every(key => typeof item[key] === 'string'));
}
export function parseTicker(data: unknown, symbol: string): Ticker | null {
  if (!Array.isArray(data)) throw new Error('Invalid ticker response.');
  const item = data.find(item => isRecord(item) && item.symbol === symbol);
  if (!item) return null;
  if (!isRecord(item) || typeof item.lastPrice !== 'string' || typeof item.ts !== 'string') throw new Error('Invalid ticker fields.');
  return { symbol, lastPrice: item.lastPrice, ts: item.ts };
}
export function normalizeTicker(asset: {symbol: string; displayName: string; instrument: Instrument}, ticker: Ticker | null, now: number, staleAfter: number): MarketAsset {
  const price = ticker && /^\d+(\.\d+)?$/.test(ticker.lastPrice) ? Number(ticker.lastPrice) : NaN;
  const ts = ticker && /^\d+$/.test(ticker.ts) ? Number(ticker.ts) : NaN;
  const validPrice = Number.isFinite(price) && price > 0;
  const validTime = Number.isSafeInteger(ts) && ts > 0 && ts <= now + 5000 && ts <= 8640000000000000;
  const available = validPrice && validTime && asset.instrument.status === 'online';
  return { symbol: asset.symbol, displayName: asset.displayName, tokenizedSymbol: asset.instrument.symbol,
    quoteCurrency: asset.instrument.quoteCoin, tokenizedPrice: validPrice ? price : null,
    tokenizedTimestamp: validTime ? new Date(ts).toISOString() : null,
    referencePrice: null, referenceTimestamp: null, marketSession: 'UNKNOWN', rawDislocationPercent: null,
    indicativeGapPercent: null, indicativeGapDirection: null, isIndicativeOnly: false,
    fxNormalizedTokenizedPrice: null, fxNormalizedDislocationPercent: null,
    sessionSource: null, sessionEvaluatedAt: null,
    referenceType: null, referenceBid: null, referenceAsk: null,
    referenceSource: null, referenceCurrency: null, dislocationDirection: null,
    absoluteDifference: null, priceDifference: null, bitgetStatus: !available ? 'UNAVAILABLE' : now - ts > staleAfter ? 'DELAYED' : 'LIVE',
    referenceStatus: 'UNAVAILABLE', comparisonStatus: 'UNAVAILABLE',
    tokenizedAgeMs: validTime ? Math.max(0, now - ts) : null, referenceAgeMs: null, timestampSkewMs: null, comparisonAsOf: null,
    dataStatus: !available ? 'UNAVAILABLE' : now - ts > staleAfter ? 'DELAYED' : 'LIVE',
    issue: !available ? 'No usable current ticker for this instrument.' : null };
}
