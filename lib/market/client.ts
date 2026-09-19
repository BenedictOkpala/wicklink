import 'server-only';
import { getMarket as getBitgetMarket } from '../bitget/client';
import { getReference } from '../alpaca/client';
import { mergeMarket } from './merge';
import type { MarketResponse } from '../bitget/types';
import type { ReferenceResult } from '../alpaca/types';
import { getSessionInputs } from '../bitget/session';
import { selectReference } from './select';
import { resolveSession } from './resolve-session';

type Feed = 'iex' | 'overnight';
const referenceCache = new Map<Feed, { expires: number; value: ReferenceResult }>();
const pending = new Map<Feed, Promise<ReferenceResult>>();

async function cachedReference(feed: Feed) {
  const cached = referenceCache.get(feed);
  if (cached && cached.expires > Date.now()) return cached.value;
  let request = pending.get(feed);
  if (!request) {
    request = getReference(feed).then(value => {
      referenceCache.set(feed, { value, expires: Date.now() + 10000 });
      return value;
    }).finally(() => { pending.delete(feed); });
    pending.set(feed, request);
  }
  return request;
}

export async function getMarket(): Promise<MarketResponse> {
  const [bitget, inputs] = await Promise.all([getBitgetMarket(), getSessionInputs()]);
  const initial = resolveSession(inputs.states, inputs.calendar, Date.now());
  const feed: Feed = initial.session === 'OVERNIGHT' ? 'overnight' : 'iex';
  const empty: ReferenceResult = { trades: [], status: 'UNAVAILABLE', issue: 'No reference requested for this session.' };
  let fetched = empty;
  try {
    fetched = await cachedReference(feed);
  } catch (err) {
    fetched = { trades: [], status: 'ERROR', issue: err instanceof Error ? err.message : 'Reference fetch failed.' };
  }
  // A fetch may cross a session boundary. Resolve again and never reuse the old session's feed.
  const now = Date.now();
  const session = resolveSession(inputs.states, inputs.calendar, now);
  const reference = selectReference(
    session.session,
    feed === 'iex' ? fetched : empty,
    feed === 'overnight' ? fetched : empty,
    { allowContext: true }
  );
  const result = mergeMarket({ ...bitget, assets: bitget.assets.map(asset => ({ ...asset,
    marketSession: session.session, sessionSource: session.sessionSource, sessionEvaluatedAt: session.evaluatedAt,
  })) }, reference, now);
  return { ...result, sessionIssue: session.issue ?? undefined, sessionDiagnostics: session, events: [...result.events, {
    timestamp: result.fetchedAt,
    message: `US session: ${session.session}. Selected reference feed: ${reference.feed ?? 'none'}. ${session.issue ?? 'Resolved from Bitget schedule and calendar.'} ${session.timezoneDiagnostic ?? ''}`.trim(),
  }] };
}
