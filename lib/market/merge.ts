import type { MarketAsset, MarketResponse } from '../bitget/types.ts';
import type { ReferenceResult } from '../alpaca/types.ts';
import { calculateDislocation } from '../dislocation/calculate.ts';
import { ageInMilliseconds, MAX_PRICE_AGE_MS, MAX_TIMESTAMP_SKEW_MS } from './policy.ts';
import { referenceSymbol } from './symbols.ts';

export function mergeAsset(asset: MarketAsset, reference: ReferenceResult, now: number, fxRate?: MarketResponse['fxRate']): MarketAsset {
  const mapped = referenceSymbol(asset.tokenizedSymbol);
  const trade = mapped === asset.symbol ? reference.trades.find(item => item.symbol === mapped) : undefined;
  const tokenizedAgeMs = ageInMilliseconds(asset.tokenizedTimestamp, now);
  const referenceAgeMs = ageInMilliseconds(trade?.timestamp ?? null, now);
  const validReference = trade && trade.price !== null && Number.isFinite(trade.price) && trade.price > 0 && referenceAgeMs !== null;
  const validTokenized = asset.tokenizedPrice !== null && Number.isFinite(asset.tokenizedPrice) && asset.tokenizedPrice > 0 && tokenizedAgeMs !== null;
  const isOffHours = asset.marketSession === 'AFTER_HOURS' || asset.marketSession === 'CLOSED' || asset.marketSession === 'PRE_MARKET';
  const isStaleReference = reference.status === 'DELAYED' || (referenceAgeMs !== null && referenceAgeMs > MAX_PRICE_AGE_MS);
  const bitgetStatus = asset.dataStatus === 'LIVE' && tokenizedAgeMs !== null && tokenizedAgeMs > MAX_PRICE_AGE_MS ? 'DELAYED' : asset.dataStatus;
  const referenceStatus = reference.status === 'ERROR' ? 'ERROR' : !validReference ? 'UNAVAILABLE' : isStaleReference ? 'DELAYED' : trade.status;
  const timestampSkewMs = tokenizedAgeMs !== null && referenceAgeMs !== null && asset.tokenizedTimestamp && trade?.timestamp ? Math.abs(Date.parse(asset.tokenizedTimestamp) - Date.parse(trade.timestamp)) : null;

  const fxNormalizedTokenizedPrice = validTokenized && fxRate && fxRate.rate > 0
    ? Number((asset.tokenizedPrice! * fxRate.rate).toFixed(4))
    : null;

  const row: MarketAsset = {
    ...asset, referencePrice: trade?.price ?? null, referenceTimestamp: trade?.timestamp ?? null,
    referenceSource: (trade?.feed ?? reference.feed) === 'overnight' ? 'Alpaca Overnight Indicative' : trade || reference.feed === 'iex' ? 'Alpaca IEX' : null,
    referenceType: trade ? trade.feed === 'overnight' ? 'INDICATIVE_MIDPOINT' : 'TRADE' : null,
    referenceBid: trade?.bidPrice ?? null, referenceAsk: trade?.askPrice ?? null,
    referenceCurrency: 'USD', referenceStatus, bitgetStatus,
    tokenizedAgeMs, referenceAgeMs, timestampSkewMs, comparisonAsOf: new Date(now).toISOString(),
    rawDislocationPercent: null, absoluteDifference: null, priceDifference: null, dislocationDirection: null,
    indicativeGapPercent: null, indicativeGapDirection: null, isIndicativeOnly: false,
    fxNormalizedTokenizedPrice, fxNormalizedDislocationPercent: null,
    comparisonStatus: 'UNAVAILABLE',
  };
  if (bitgetStatus === 'ERROR' || referenceStatus === 'ERROR') {
    return { ...row, comparisonStatus: 'ERROR', dataStatus: 'ERROR', issue: asset.issue ?? reference.issue ?? 'Provider request failed.' };
  }
  if (!validTokenized || !validReference || bitgetStatus === 'UNAVAILABLE' || referenceStatus === 'UNAVAILABLE') {
    return { ...row, dataStatus: 'UNAVAILABLE', issue: asset.issue ?? reference.issue ?? (!validTokenized ? 'Tokenized price unavailable.' : 'Underlying reference unavailable.') };
  }

  let result: ReturnType<typeof calculateDislocation>;
  let fxResult: ReturnType<typeof calculateDislocation> | null = null;
  try {
    result = calculateDislocation(row.referencePrice!, row.tokenizedPrice!);
    if (fxNormalizedTokenizedPrice !== null) {
      fxResult = calculateDislocation(row.referencePrice!, fxNormalizedTokenizedPrice);
    }
  } catch {
    return { ...row, dataStatus: 'ERROR', comparisonStatus: 'ERROR', issue: 'Comparison withheld: prices exceed the supported numeric range.' };
  }

  if (isStaleReference || tokenizedAgeMs > MAX_PRICE_AGE_MS || bitgetStatus === 'DELAYED' || referenceStatus === 'DELAYED') {
    const issueText = isOffHours
      ? `Reference market closed (${asset.marketSession}). Indicative gap provided for context only.`
      : 'Comparison withheld: a provider price is stale.';
    return {
      ...row,
      dataStatus: 'DELAYED',
      comparisonStatus: 'STALE',
      referenceStatus: 'DELAYED',
      rawDislocationPercent: null,
      absoluteDifference: null,
      priceDifference: null,
      dislocationDirection: null,
      indicativeGapPercent: result.percentageDifference,
      indicativeGapDirection: result.direction,
      isIndicativeOnly: true,
      fxNormalizedDislocationPercent: fxResult ? fxResult.percentageDifference : null,
      issue: issueText,
    };
  }
  if (timestampSkewMs === null || timestampSkewMs > MAX_TIMESTAMP_SKEW_MS) {
    return {
      ...row,
      dataStatus: 'DELAYED',
      comparisonStatus: 'ASYNCHRONOUS',
      rawDislocationPercent: null,
      absoluteDifference: null,
      priceDifference: null,
      dislocationDirection: null,
      indicativeGapPercent: result.percentageDifference,
      indicativeGapDirection: result.direction,
      isIndicativeOnly: true,
      issue: 'Comparison withheld: provider timestamps differ by more than 30 seconds.',
    };
  }

  return {
    ...row,
    dataStatus: 'LIVE',
    comparisonStatus: 'AVAILABLE',
    issue: null,
    rawDislocationPercent: result.percentageDifference,
    absoluteDifference: result.absoluteDifference,
    priceDifference: result.direction === 'discount' ? -result.absoluteDifference : result.absoluteDifference,
    dislocationDirection: result.direction,
    indicativeGapPercent: null,
    isIndicativeOnly: false,
    fxNormalizedDislocationPercent: fxResult ? fxResult.percentageDifference : null,
  };
}

export function mergeMarket(bitget: MarketResponse, reference: ReferenceResult, now: number): MarketResponse {
  const assets = bitget.assets.map(asset => mergeAsset(asset, reference, now, bitget.fxRate));
  const dataStatus = assets.length === 0 ? bitget.dataStatus : assets.some(a => a.dataStatus === 'ERROR') ? 'ERROR' : assets.some(a => a.dataStatus === 'UNAVAILABLE') ? 'UNAVAILABLE' : assets.some(a => a.dataStatus === 'DELAYED') ? 'DELAYED' : 'LIVE';
  return {
    ...bitget, assets, dataStatus, fetchedAt: new Date(now).toISOString(),
    referenceAvailable: assets.some(a => a.referencePrice !== null),
    message: reference.issue ?? 'Alpaca references are feed-specific and are not consolidated SIP pricing.',
    events: [...bitget.events, { timestamp: new Date(now).toISOString(), message: reference.issue ?? `Alpaca ${reference.feed ?? 'iex'} returned ${reference.trades.filter(t => t.price !== null).length} reference prices; ${assets.filter(a => a.comparisonStatus === 'AVAILABLE').length} comparisons available.` }],
  };
}
