import 'server-only';
import { requestReference } from './request';
import { MONITORED_SYMBOLS } from '../market/symbols';

export function getReference(feed: 'iex' | 'overnight' = 'iex', symbols: readonly string[] = MONITORED_SYMBOLS) {
  const key = process.env.APCA_API_KEY_ID || process.env['APCA-API-KEY-ID'];
  const secret = process.env.APCA_API_SECRET_KEY || process.env['APCA-API-SECRET-KEY'];
  return requestReference({ key, secret }, fetch, Date.now, feed, symbols);
}
