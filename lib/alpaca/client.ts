import 'server-only';
import { requestReference } from './request';
import { MONITORED_SYMBOLS } from '../market/symbols';

export function getReference(feed: 'iex' | 'overnight' = 'iex', symbols: readonly string[] = MONITORED_SYMBOLS) {
  return requestReference({ key: process.env['APCA-API-KEY-ID'], secret: process.env['APCA-API-SECRET-KEY'] }, fetch, Date.now, feed, symbols);
}
