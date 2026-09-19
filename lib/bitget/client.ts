import 'server-only';
import { discoverSymbols } from './symbols';
import { isRecord, normalizeTicker, parseInstruments, parseTicker } from './normalize';
import type { MarketResponse } from './types';

async function request(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, 'https://api.bitget.com');
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Bitget HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body) || body.code !== '00000') throw new Error(`Bitget rejected request (${isRecord(body) && typeof body.code === 'string' ? body.code : 'invalid response'})`);
  return body.data;
}
async function fetchMarket(): Promise<MarketResponse> {
  const events: MarketResponse['events'] = [];
  const event = (message: string) => events.push({ timestamp: new Date().toISOString(), message });
  event('Loading Reality instruments from Bitget.');
  try {
    const symbols = discoverSymbols(parseInstruments(await request('/api/v3/market/instruments', { category: 'SPOT' })));
    event(`Confirmed ${symbols.length} supported Reality instruments.`);
    const configured = Number(process.env.MARKET_STALE_AFTER_MS ?? 60000);
    const staleAfter = Number.isFinite(configured) && configured >= 1000 && configured <= 300000 ? configured : 60000;
    let allTickers: unknown = null;
    try {
      allTickers = await request('/api/v3/market/tickers', { category: 'SPOT' });
    } catch {
      // Fallback if batch endpoint encounters an error
    }
    const assets = await Promise.all(symbols.map(async asset => {
      try {
        let ticker = null;
        if (Array.isArray(allTickers)) {
          ticker = parseTicker(allTickers, asset.instrument.symbol);
        }
        if (!ticker) {
          ticker = parseTicker(await request('/api/v3/market/tickers', { category: 'SPOT', symbol: asset.instrument.symbol }), asset.instrument.symbol);
        }
        return normalizeTicker(asset, ticker, Date.now(), staleAfter);
      } catch {
        return { ...normalizeTicker(asset, null, Date.now(), staleAfter), dataStatus: 'ERROR' as const, issue: 'Bitget ticker request failed. Retrying on next refresh.' };
      }
    }));
    let fxRate: MarketResponse['fxRate'] = null;
    if (Array.isArray(allTickers)) {
      const usdtItem = allTickers.find(item => isRecord(item) && item.symbol === 'USDTUSD');
      if (usdtItem && isRecord(usdtItem) && typeof usdtItem.lastPrice === 'string' && typeof usdtItem.ts === 'string') {
        const rate = Number(usdtItem.lastPrice);
        const ts = Number(usdtItem.ts);
        if (Number.isFinite(rate) && rate > 0 && Number.isSafeInteger(ts)) {
          const ageMs = Math.max(0, Date.now() - ts);
          fxRate = {
            pair: 'USDT/USD',
            rate,
            timestamp: new Date(ts).toISOString(),
            ageMs,
            status: ageMs <= staleAfter ? 'LIVE' : 'DELAYED',
            source: 'Bitget USDTUSD Spot',
            parityDeltaPercent: Number((((rate - 1.0) / 1.0) * 100).toPrecision(4)),
          };
        }
      }
    }
    const dataStatus = assets.length === 0 ? 'UNAVAILABLE' : assets.some(a => a.dataStatus === 'ERROR') ? 'ERROR' : assets.some(a => a.dataStatus === 'UNAVAILABLE') ? 'UNAVAILABLE' : assets.some(a => a.dataStatus === 'DELAYED') ? 'DELAYED' : 'LIVE';
    event(`Ticker fetch complete: ${assets.filter(a => a.tokenizedPrice !== null).length}/${assets.length} prices available.`);
    event(dataStatus === 'LIVE' ? 'Market monitor ready.' : `Market monitor status: ${dataStatus.toLowerCase()}.`);
    return { assets, fxRate, fetchedAt: new Date().toISOString(), dataStatus, referenceAvailable: false, message: 'Underlying US-stock reference prices are not supplied by the verified endpoints.', events };
  } catch {
    event('Bitget instrument discovery failed. Retrying on next refresh.');
    return { assets: [], fetchedAt: new Date().toISOString(), dataStatus: 'ERROR', referenceAvailable: false, message: 'Unable to reach or validate Bitget instrument data.', events };
  }
}
// Per-process request coalescing and a short cache reduce upstream polling load.
let cached: { expires: number; value: MarketResponse } | undefined;
let pending: Promise<MarketResponse> | undefined;
export async function getMarket() {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (!pending) pending = fetchMarket().then(value => { cached = { value, expires: Date.now() + 10000 }; return value; }).finally(() => { pending = undefined; });
  return pending;
}
