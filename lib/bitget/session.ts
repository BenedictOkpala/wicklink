import 'server-only';
import { isRecord } from './normalize';

export interface SessionInputs { states: unknown; calendar: unknown }
let cached: { expires: number; value: SessionInputs } | undefined;
let pending: Promise<SessionInputs> | undefined;

async function request(kind: 'states' | 'calendar'): Promise<unknown> {
  const response = await fetch(`https://api.bitget.com/api/v3/reality/market/${kind}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || body.code !== '00000') throw new Error('Session input request failed');
  return body;
}

// Cache authoritative inputs, never the resolved session. Resolve at every injected time.
export async function getSessionInputs(): Promise<SessionInputs> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (!pending) pending = Promise.all([request('states'), request('calendar')])
    .then(([states, calendar]) => ({ states, calendar }))
    .catch(() => ({ states: null, calendar: null }))
    .then(value => { cached = { value, expires: Date.now() + 10000 }; return value; })
    .finally(() => { pending = undefined; });
  return pending;
}
