// Pure transport seam for offline testing without server-only.
import { normalizeCatalystNews } from './normalize.ts';
import type { CatalystEvidence } from './types.ts';

export async function requestCatalystNews(
  symbol: string,
  credentials: { key?: string; secret?: string },
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
  windowHours = 48
): Promise<CatalystEvidence> {
  const upperSymbol = symbol.trim().toUpperCase();
  const searchedAt = new Date(now).toISOString();

  const key = credentials.key?.trim();
  const secret = credentials.secret?.trim();

  if (!key || !secret) {
    return {
      status: 'UNCONFIGURED',
      provider: 'Alpaca Market News',
      searchedAt,
      symbol: upperSymbol,
      windowHours,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: 'Catalyst news credentials are not configured in .env.local (APCA-API-KEY-ID & APCA-API-SECRET-KEY).',
    };
  }

  try {
    const url = new URL('/v1beta1/news', 'https://data.alpaca.markets');
    url.searchParams.set('symbols', upperSymbol);
    url.searchParams.set('limit', '10');
    url.searchParams.set('include_content', 'false');

    // Bounded search window: calculate start timestamp
    const startIso = new Date(now - windowHours * 3600 * 1000).toISOString();
    url.searchParams.set('start', startIso);

    const response = await fetcher(url.toString(), {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return {
        status: 'UNAVAILABLE',
        provider: 'Alpaca Market News',
        searchedAt,
        symbol: upperSymbol,
        windowHours,
        articles: [],
        breakingCount: 0,
        recentCount: 0,
        materialCount: 0,
        issue: `News provider request failed with HTTP ${response.status}.`,
      };
    }

    const body: unknown = await response.json();
    return normalizeCatalystNews(body, upperSymbol, now, windowHours, 'Alpaca Market News');
  } catch (err) {
    return {
      status: 'UNAVAILABLE',
      provider: 'Alpaca Market News',
      searchedAt,
      symbol: upperSymbol,
      windowHours,
      articles: [],
      breakingCount: 0,
      recentCount: 0,
      materialCount: 0,
      issue: err instanceof Error ? err.message : 'News feed request timed out or failed.',
    };
  }
}

