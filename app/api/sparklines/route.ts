import { NextResponse } from 'next/server';

interface BitgetRawCandleResponse {
  code: string;
  msg: string;
  data?: string[][];
}

// 60-second in-memory cache
let cachedSparklines: Record<string, number[] | null> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

const SYMBOL_MAP: Record<string, string> = {
  AAPL: 'RAAPLUSDT',
  NVDA: 'RNVDAUSDT',
  TSLA: 'RTSLAUSDT',
  MSFT: 'RMSFTUSDT',
  AMZN: 'RAMZNUSDT',
  META: 'RMETAUSDT',
  GOOGL: 'RGOOGLUSDT',
  AMD: 'RAMDUSDT',
  NFLX: 'RNFLXUSDT',
  COIN: 'RCOINUSDT',
  PLTR: 'RPLTRUSDT',
  MSTR: 'RMSTRUSDT',
  DIS: 'RDISUSDT',
  INTC: 'RINTCUSDT',
};

async function fetchCandleSeries(bitgetSymbol: string): Promise<number[] | null> {
  try {
    const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${encodeURIComponent(bitgetSymbol)}&granularity=1h&limit=12`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as BitgetRawCandleResponse;
    if (body.code !== '00000' || !Array.isArray(body.data) || body.data.length === 0) {
      return null;
    }
    // Bitget candles are [timestamp, open, high, low, close, volume, ...]
    // Sort chronologically ascending if needed
    const sorted = [...body.data].sort((a, b) => Number(a[0]) - Number(b[0]));
    const closes = sorted.map(c => Number(c[4])).filter(val => Number.isFinite(val) && val > 0);
    return closes.length >= 2 ? closes : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSymbol = searchParams.get('symbol')?.toUpperCase();

  const now = Date.now();
  if (!cachedSparklines || now - lastFetchTime > CACHE_TTL_MS) {
    const symbols = Object.keys(SYMBOL_MAP);
    const results: Record<string, number[] | null> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        const bitgetSym = SYMBOL_MAP[sym];
        results[sym] = await fetchCandleSeries(bitgetSym);
      })
    );

    cachedSparklines = results;
    lastFetchTime = now;
  }

  if (requestedSymbol) {
    return NextResponse.json({
      symbol: requestedSymbol,
      points: cachedSparklines[requestedSymbol] ?? null,
      cachedAt: new Date(lastFetchTime).toISOString(),
    });
  }

  return NextResponse.json({
    sparklines: cachedSparklines,
    cachedAt: new Date(lastFetchTime).toISOString(),
  });
}

