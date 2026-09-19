import 'server-only';
import { isRecord } from '../bitget/normalize.ts';
import { getSessionInputs } from '../bitget/session.ts';
import { resolveSession } from '../market/resolve-session.ts';
import { ageInMilliseconds, MAX_PRICE_AGE_MS, MAX_TIMESTAMP_SKEW_MS } from '../market/policy.ts';
import { calculateDislocation } from '../dislocation/calculate.ts';
import { getReference } from '../alpaca/client.ts';
import { getCatalystEvidence } from '../catalyst/client.ts';
import type { InvestigationEvidence, OrderbookLevel, OrderbookSnapshot } from './types.ts';

import { getSymbolMetadata, isSupportedSymbol } from './symbols.ts';
export { isSupportedSymbol };


async function fetchBitgetTicker(tokenizedSymbol: string) {
  try {
    const url = new URL('/api/v3/market/tickers', 'https://api.bitget.com');
    url.search = new URLSearchParams({ category: 'SPOT', symbol: tokenizedSymbol }).toString();
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isRecord(body) || body.code !== '00000' || !Array.isArray(body.data) || !body.data[0] || !isRecord(body.data[0])) {
      return null;
    }
    return body.data[0];
  } catch {
    return null;
  }
}

async function fetchBitgetOrderbook(tokenizedSymbol: string): Promise<OrderbookSnapshot | null> {
  try {
    const url = new URL('/api/v3/market/orderbook', 'https://api.bitget.com');
    url.search = new URLSearchParams({ category: 'SPOT', symbol: tokenizedSymbol, limit: '5' }).toString();
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isRecord(body) || body.code !== '00000' || !isRecord(body.data)) return null;

    const parseLevels = (raw: unknown): OrderbookLevel[] => {
      if (!Array.isArray(raw)) return [];
      return raw
        .map(level => {
          if (!Array.isArray(level) || level.length < 2) return null;
          const price = typeof level[0] === 'number' ? level[0] : Number(level[0]);
          const size = typeof level[1] === 'number' ? level[1] : Number(level[1]);
          return Number.isFinite(price) && Number.isFinite(size) && price > 0 && size >= 0 ? { price, size } : null;
        })
        .filter((level): level is OrderbookLevel => level !== null);
    };

    const bids = parseLevels(body.data.b);
    const asks = parseLevels(body.data.a);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spreadAmount = bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? Number((bestAsk - bestBid).toPrecision(6)) : null;
    const spreadPercent = spreadAmount !== null && bestBid !== null && bestBid > 0 ? Number(((spreadAmount / bestBid) * 100).toPrecision(6)) : null;
    const rawTs = body.data.ts;
    const timestamp = typeof rawTs === 'string' && /^\d+$/.test(rawTs) ? new Date(Number(rawTs)).toISOString() : null;

    return { bids, asks, timestamp, spreadAmount, spreadPercent };
  } catch {
    return null;
  }
}

export async function collectMarketEvidence(rawSymbol: string): Promise<InvestigationEvidence> {
  const symbol = rawSymbol.toUpperCase();
  const meta = getSymbolMetadata(symbol);
  if (!meta) {
    throw new Error(`Unsupported instrument symbol: ${rawSymbol}. Supported symbols: AAPL, NVDA, TSLA`);
  }

  const now = Date.now();
  const limitations: string[] = [
    'Raw USDT vs USD comparison without FX rate adjustment.',
    'Underlying reference data is sourced from Alpaca and may differ from consolidated SIP tape.',
  ];

  // 1. Concurrently retrieve Bitget ticker, orderbook, session inputs, catalyst news
  const [tickerRaw, orderbook, sessionInputs, catalyst] = await Promise.all([
    fetchBitgetTicker(meta.tokenizedSymbol),
    fetchBitgetOrderbook(meta.tokenizedSymbol),
    getSessionInputs(),
    getCatalystEvidence(symbol),
  ]);

  if (!orderbook) {
    limitations.push('Public orderbook depth query unavailable or timed out; relying on ticker BBO.');
  }

  if (catalyst.status === 'AVAILABLE' && catalyst.articles.length > 0) {
    limitations.push(`Retrieved ${catalyst.articles.length} news headline(s) via ${catalyst.provider}; correlation does not prove causality.`);
  } else if (catalyst.status === 'UNCONFIGURED') {
    limitations.push('Market catalyst news feed is unconfigured in server environment.');
  } else if (catalyst.status === 'UNAVAILABLE') {
    limitations.push(`Market catalyst news feed unavailable: ${catalyst.issue ?? 'query failed'}`);
  }

  // 2. Resolve Market Session
  const session = resolveSession(sessionInputs.states, sessionInputs.calendar, now);
  if (session.timezoneDiagnostic) {
    limitations.push(`Session timezone diagnostic: ${session.timezoneDiagnostic}`);
  }

  // 3. Parse Bitget Ticker
  const parseNum = (val: unknown): number | null => {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
    if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val)) {
      const parsed = Number(val);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const tokenizedPrice = tickerRaw ? parseNum(tickerRaw.lastPrice) : null;
  const bitgetTs = tickerRaw && typeof tickerRaw.ts === 'string' && /^\d+$/.test(tickerRaw.ts) ? Number(tickerRaw.ts) : null;
  const tokenizedTimestamp = bitgetTs !== null ? new Date(bitgetTs).toISOString() : null;
  const tokenizedAgeMs = ageInMilliseconds(tokenizedTimestamp, now);

  const bitgetBid1Price = tickerRaw ? parseNum(tickerRaw.bid1Price) : orderbook?.bids[0]?.price ?? null;
  const bitgetAsk1Price = tickerRaw ? parseNum(tickerRaw.ask1Price) : orderbook?.asks[0]?.price ?? null;
  const bitgetBid1Size = tickerRaw ? parseNum(tickerRaw.bid1Size) : orderbook?.bids[0]?.size ?? null;
  const bitgetAsk1Size = tickerRaw ? parseNum(tickerRaw.ask1Size) : orderbook?.asks[0]?.size ?? null;

  let bitgetSpreadAmount: number | null = null;
  let bitgetSpreadPercent: number | null = null;
  if (bitgetBid1Price !== null && bitgetAsk1Price !== null && bitgetAsk1Price >= bitgetBid1Price) {
    bitgetSpreadAmount = Number((bitgetAsk1Price - bitgetBid1Price).toPrecision(6));
    bitgetSpreadPercent = Number(((bitgetSpreadAmount / bitgetBid1Price) * 100).toPrecision(6));
  }

  const bitgetVolume24h = tickerRaw ? parseNum(tickerRaw.volume24h) : null;
  const bitgetTurnover24h = tickerRaw ? parseNum(tickerRaw.turnover24h) : null;
  const bitgetHigh24h = tickerRaw ? parseNum(tickerRaw.highPrice24h) : null;
  const bitgetLow24h = tickerRaw ? parseNum(tickerRaw.lowPrice24h) : null;
  const bitgetPriceChange24hPcnt = tickerRaw && typeof tickerRaw.price24hPcnt === 'string' ? Number(tickerRaw.price24hPcnt) * 100 : null;

  // 4. Retrieve Reference Market Data (Alpaca)
  const isOffHours = session.session === 'AFTER_HOURS' || session.session === 'CLOSED' || session.session === 'PRE_MARKET';
  const feedType = session.session === 'OVERNIGHT' ? 'overnight' : 'iex';
  let referencePrice: number | null = null;
  let referenceTimestamp: string | null = null;
  let referenceSource: string | null = null;
  let referenceType: 'TRADE' | 'INDICATIVE_MIDPOINT' | null = null;
  let referenceBid: number | null = null;
  let referenceAsk: number | null = null;
  let referenceSpreadPercent: number | null = null;
  let referenceStatus: InvestigationEvidence['referenceStatus'] = 'UNAVAILABLE';

  try {
    const refResult = await getReference(feedType);
    const trade = refResult.trades.find(t => t.symbol === symbol);
    if (trade && trade.price !== null) {
      referencePrice = trade.price;
      referenceTimestamp = trade.timestamp;
      referenceSource = trade.feed === 'overnight' ? 'Alpaca Overnight Indicative' : isOffHours ? 'Alpaca IEX (Last Close)' : 'Alpaca IEX';
      referenceType = trade.referenceType ?? (trade.feed === 'overnight' ? 'INDICATIVE_MIDPOINT' : 'TRADE');
      referenceBid = trade.bidPrice ?? null;
      referenceAsk = trade.askPrice ?? null;
      if (referenceBid !== null && referenceAsk !== null && referenceBid > 0 && referenceAsk >= referenceBid) {
        referenceSpreadPercent = Number((((referenceAsk - referenceBid) / referenceBid) * 100).toPrecision(6));
      }
      referenceStatus = isOffHours ? 'DELAYED' : trade.status;
    } else {
      limitations.push(`Underlying reference trade for ${symbol} was not returned by Alpaca.`);
    }
  } catch {
    limitations.push('Alpaca reference request failed.');
    referenceStatus = 'ERROR';
  }

  const referenceAgeMs = ageInMilliseconds(referenceTimestamp, now);

  // 5. Evaluate Statuses & Freshness Gates
  const bitgetStatus: InvestigationEvidence['bitgetStatus'] = !tickerRaw ? 'ERROR' : tokenizedPrice === null ? 'UNAVAILABLE' : tokenizedAgeMs !== null && tokenizedAgeMs > MAX_PRICE_AGE_MS ? 'DELAYED' : 'LIVE';

  let timestampSkewMs: number | null = null;
  if (tokenizedTimestamp && referenceTimestamp) {
    timestampSkewMs = Math.abs(Date.parse(tokenizedTimestamp) - Date.parse(referenceTimestamp));
  }

  let comparisonStatus: InvestigationEvidence['comparisonStatus'] = 'UNAVAILABLE';
  let rawDislocationPercent: number | null = null;
  let dislocationDirection: InvestigationEvidence['dislocationDirection'] = null;
  let indicativeGapPercent: number | null = null;
  let indicativeGapDirection: InvestigationEvidence['dislocationDirection'] = null;
  let isIndicativeOnly = false;
  let absoluteDifference: number | null = null;
  let priceDifference: number | null = null;

  if (bitgetStatus === 'ERROR' || referenceStatus === 'ERROR') {
    comparisonStatus = 'ERROR';
  } else if (!tokenizedPrice || !referencePrice || bitgetStatus === 'UNAVAILABLE' || referenceStatus === 'UNAVAILABLE') {
    comparisonStatus = 'UNAVAILABLE';
  } else if (isOffHours) {
    comparisonStatus = 'STALE';
    isIndicativeOnly = true;
    limitations.push(`Reference market is closed (${session.session}). Showing indicative gap against last closing reference; active dislocation withheld.`);
    try {
      const calc = calculateDislocation(referencePrice, tokenizedPrice);
      indicativeGapPercent = calc.percentageDifference;
      indicativeGapDirection = calc.direction;
      absoluteDifference = calc.absoluteDifference;
      priceDifference = calc.direction === 'discount' ? -calc.absoluteDifference : calc.absoluteDifference;
    } catch {
      comparisonStatus = 'ERROR';
      limitations.push('Dislocation calculation failed due to numeric range limits.');
    }
  } else if ((tokenizedAgeMs ?? 0) > MAX_PRICE_AGE_MS || (referenceAgeMs ?? 0) > MAX_PRICE_AGE_MS) {
    comparisonStatus = 'STALE';
    limitations.push('Dislocation calculation withheld because one or both market observations exceed 60s freshness.');
  } else if (timestampSkewMs === null || timestampSkewMs > MAX_TIMESTAMP_SKEW_MS) {
    comparisonStatus = 'ASYNCHRONOUS';
    limitations.push('Dislocation calculation withheld because observation timestamps differ by more than 30s.');
  } else {
    try {
      const calc = calculateDislocation(referencePrice, tokenizedPrice);
      rawDislocationPercent = calc.percentageDifference;
      dislocationDirection = calc.direction;
      absoluteDifference = calc.absoluteDifference;
      priceDifference = calc.direction === 'discount' ? -calc.absoluteDifference : calc.absoluteDifference;
      comparisonStatus = 'AVAILABLE';
    } catch {
      comparisonStatus = 'ERROR';
      limitations.push('Dislocation calculation failed due to numeric range limits.');
    }
  }

  const dataStatus: InvestigationEvidence['dataStatus'] =
    comparisonStatus === 'AVAILABLE'
      ? 'LIVE'
      : bitgetStatus === 'ERROR' || referenceStatus === 'ERROR'
        ? 'ERROR'
        : bitgetStatus === 'DELAYED' || referenceStatus === 'DELAYED'
          ? 'DELAYED'
          : 'UNAVAILABLE';

  return {
    symbol,
    displayName: meta.displayName,
    tokenizedSymbol: meta.tokenizedSymbol,
    quoteCurrency: 'USDT',
    referenceCurrency: 'USD',
    tokenizedPrice,
    referencePrice,
    rawDislocationPercent,
    dislocationDirection,
    indicativeGapPercent,
    indicativeGapDirection,
    isIndicativeOnly,
    absoluteDifference,
    priceDifference,
    tokenizedTimestamp,
    referenceTimestamp,
    tokenizedAgeMs,
    referenceAgeMs,
    timestampSkewMs,
    marketSession: session.session,
    sessionSource: session.sessionSource,
    sessionDiagnostic: session.timezoneDiagnostic,
    comparisonStatus,
    dataStatus,
    bitgetStatus,
    referenceStatus,
    referenceSource,
    referenceType,
    referenceBid,
    referenceAsk,
    referenceSpreadPercent,
    bitgetBid1Price,
    bitgetAsk1Price,
    bitgetBid1Size,
    bitgetAsk1Size,
    bitgetSpreadAmount,
    bitgetSpreadPercent,
    bitgetVolume24h,
    bitgetTurnover24h,
    bitgetHigh24h,
    bitgetLow24h,
    bitgetPriceChange24hPcnt,
    orderbook,
    catalyst,
    limitations,
  };
}
