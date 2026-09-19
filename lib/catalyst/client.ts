import 'server-only';
import { requestCatalystNews } from './request.ts';
import type { CatalystEvidence } from './types.ts';

export { requestCatalystNews };

export async function getCatalystEvidence(
  symbol: string,
  observationTimestamp?: string | null,
  windowHours = 48
): Promise<CatalystEvidence> {
  const credentials = {
    key: process.env['APCA-API-KEY-ID'] || process.env.NEWS_API_KEY,
    secret: process.env['APCA-API-SECRET-KEY'] || process.env.NEWS_API_SECRET,
  };

  const observationTime = observationTimestamp
    ? Date.parse(observationTimestamp)
    : Date.now();

  const now = Number.isFinite(observationTime) ? observationTime : Date.now();

  return requestCatalystNews(symbol, credentials, fetch, now, windowHours);
}
