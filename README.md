# NightShift — Stage 2.7: Final session resolution

Stage 2.7 makes **IANA `America/New_York` authoritative for timezone conversion and DST**, while preserving Bitget's actual session boundaries and calendar closures. Provider `daylightType` and recognized EST/EDT labels are diagnostic metadata, never a session blocker on their own. No UTC-4/UTC-5 offset or replacement session schedule is hardcoded. No AI, MCP, AgentRouter, trading, orders, wallets or redesign was added.

## Current behavior

- Conflicting, missing or unrecognized Bitget daylight metadata produces `sessionDiagnostics.timezoneDiagnostic`. The reported value, IANA-derived daylight state and diagnostic remain visible in the API, dashboard and factual event log. Successful resolution has `issue=null`; the warning is separate from errors that actually prevent availability.
- Actual Bitget schedules continue to supply all session boundaries. REGULAR selects Alpaca IEX trades; OVERNIGHT selects the verified overnight indicative midpoint. PRE_MARKET/AFTER_HOURS still withhold comparisons without a verified feed. CLOSED/UNKNOWN never compare.
- Calendar safeguards are unchanged. Known closures override normal session times; missing/malformed data and genuinely ambiguous EST closure boundaries still fail safely. Conservative weekend reopening behavior remains documented in the Stage 2.6 history below.
- Diagnostics now expose `calendarDate`, `sessionStartDate` and `sessionEndDate`. A 20:00–04:00 session starts on the previous local date for its post-midnight portion and ends on the current local date; actual closure ranges are checked against the current New York wall timestamp.
- Freshness remains **60 seconds maximum observation age / 30 seconds maximum timestamp separation**. Session diagnostics do not bypass price validation, feed eligibility, closure checks or freshness.

This was a bounded change to `lib/market/resolve-session.ts`, diagnostic output in `lib/market/client.ts` and the existing monitor, corresponding tests, stage labels and verification evidence. The session architecture and feed strategy were otherwise retained.

## Real Stage 2.7 verification

The app restarted successfully at `http://127.0.0.1:3000`. Verification used real Bitget schedule/calendar inputs and real authenticated Alpaca references:

- `GET https://api.bitget.com/api/v3/reality/market/states`
- `GET https://api.bitget.com/api/v3/reality/market/calendar`
- `GET https://api.bitget.com/api/v3/market/instruments?category=SPOT`
- `GET https://api.bitget.com/api/v3/market/tickers?category=SPOT&symbol={confirmedSymbol}`
- `GET https://data.alpaca.markets/v2/stocks/trades/latest?symbols=AAPL,NVDA,TSLA&feed=iex&currency=USD`

At **2026-09-18T13:36:16.816Z** (09:36:16 New York time), the session was **REGULAR**, the selected feed was **Alpaca IEX**, and reference type was **TRADE**. Bitget reported `standard`; IANA resolved `dst`. The API displayed a diagnostic explaining that discrepancy and its use of IANA rules.

| Asset | Bitget (USDT) | IEX (USD) | Raw difference | Raw percent | Direction |
| --- | --- | --- | --- | --- | --- |
| AAPL | 336.68 | 336.71 | -0.03 | -0.00890974429033% | DISCOUNT |
| NVDA | 219.06 | 219.22 | -0.16 | -0.0729860414196% | DISCOUNT |
| TSLA | 366.25 | 366.135 | +0.115 | +0.0314091796742% | PREMIUM |

| Asset | Bitget snapshot (UTC) | IEX trade (UTC) | Timestamp separation |
| --- | --- | --- | --- |
| AAPL | 2026-09-18T13:36:14.249Z | 2026-09-18T13:36:16.395722227Z | 2.146 s |
| NVDA | 2026-09-18T13:36:13.296Z | 2026-09-18T13:36:12.735878052Z | 0.561 s |
| TSLA | 2026-09-18T13:36:14.468Z | 2026-09-18T13:36:16.151753699Z | 1.683 s |

**All three comparisons were AVAILABLE, with both providers LIVE.** All observed ages were below five seconds. These observations meet the configured synchronization tolerance; they are not identical timestamps or execution assessments. Prices remain a raw USDT-versus-USD numeric comparison without FX adjustment. IEX is not consolidated SIP coverage.

Evidence: [full normalized response](docs/stage27-market-response.json), [real schedule](docs/stage27-states.json), [real calendar](docs/stage27-calendar.json). These dated captures are never used as runtime fallback data and contain no credentials.

**Quality gate:** TypeScript, ESLint, **102/102 tests**, and production build passed. All 91 existing tests were retained with obsolete conflict expectations updated, and 11 regression cases were added. Dashboard and `/api/market` returned HTTP 200; POST returned 405. The integration script verified reference selection, price calculations, freshness limits and the visible timezone diagnostic in server-rendered HTML.

Remaining limits: IEX-only trade coverage, no FX/entitlement/execution adjustments, conservative ambiguous calendar/weekend handling, no pre-/after-hours strategy, and unavailable browser visual/interaction QA. No further session-architecture work or Stage 3 work is included.

## Stage 2.6 implementation history

Stage 2.6 resolves sessions from Bitget's actual schedule and calendar using an injected UTC timestamp. It does not require a `currentSession` response field. No AI, MCP, AgentRouter, wallets, orders or trading is included. Earlier stage reports below are historical; this section documents current behavior.

## Authoritative inputs and resolver

Exact session endpoints, verified with HTTP 200 on 2026-09-18:

- `GET https://api.bitget.com/api/v3/reality/market/states`
- `GET https://api.bitget.com/api/v3/reality/market/calendar`

Provider evidence: [market states](docs/stage26-states.json), [market calendar](docs/stage26-calendar.json). [Bitget API documentation](https://www.bitget.com/docs/catalog/reality/market-data).

`resolveSession(statesEnvelope, calendarEnvelope, nowUtcMs)` in `lib/market/resolve-session.ts` is a pure deterministic function. It uses `Intl.DateTimeFormat` with the explicit IANA zone `America/New_York`; never the host timezone or the actual clock. The server injects `Date.now()` only at the integration boundary. No timezone dependency was added, and no fixed UTC offset is hardcoded. Seasonal offsets are obtained from IANA timezone rules.

Consumed provider fields:

```text
states:   data.market, data.daylightType,
          data.stateList[*].state/timeZone/startTime/endTime
calendar: data.timeZone, data.regularConfig[*],
          data.specificConfig[*].startTime/endTime
```

The schedule parser accepts the documented `data` array and observed `data` object, requires exactly one US market, and validates all four known sessions. Duplicate/unknown names, invalid times, overlaps, gaps, unsupported zones or invalid provider envelopes yield UNKNOWN. The existing schedule-only compatibility adapter still returns UNKNOWN without a calendar and injected time; runtime uses the new full resolver.

Current observed schedule:

```json
{
  "market": "US",
  "daylightType": "standard",
  "stateList": [
    {"state":"pre_market","timeZone":"EST","startTime":"04:00","endTime":"09:30"},
    {"state":"regular","timeZone":"EST","startTime":"09:30","endTime":"16:00"},
    {"state":"after_hours","timeZone":"EST","startTime":"16:00","endTime":"20:00"},
    {"state":"overnight","timeZone":"EST","startTime":"20:00","endTime":"04:00"}
  ]
}
```

## Calendar, midnight and timezone policies

- Sessions use half-open intervals `[start, end)`. Overnight wraps midnight; 04:00 starts pre-market, 09:30 regular, 16:00 after-hours, and 20:00 overnight for the observed schedule. Times are read from the API, not embedded as session boundaries in the engine.
- `regularConfig` names closed local weekdays. The observed list is `SATURDAY`, `SUNDAY`. Calendar closures override apparent regular-session clock hours.
- `specificConfig` contains dated local closure intervals, also treated as half-open. The observed intervals cover June 18–19, July 2–3, and September 6–7, each from 20:00 to 20:00. A malformed/reversed interval or invalid date yields UNKNOWN rather than being ignored.
- Bitget does not specify how weekend-day closures interact with an overnight session crossing a weekend boundary. The conservative policy requires both dates touched by an overnight session to be eligible; this suppresses Friday-night/Saturday and Sunday-night/Monday edges rather than inventing a reopening rule. Known closed weekdays yield CLOSED.
- Bitget documents calendar timezone as always `EST`. In daylight time this can mean literal standard time or a generic Eastern label. For calendar closures the engine evaluates both plausible readings using IANA-derived offsets. If they disagree near a closure boundary, it returns UNKNOWN; when both are closed it returns CLOSED. It does not silently choose whichever reading opens the market.
- The schedule's `daylightType` and explicit EST/EDT labels must agree with IANA New York rules at the injected UTC instant. A conflict yields UNKNOWN, unless a calendar closure is independently confirmed. Generic `ET` and `America/New_York` labels use regional rules, with `daylightType` still validated.
- Missing calendars, failed requests, unsupported semantics or invalid timestamps yield UNKNOWN. Returned calendar entries are treated as the provider's supplied closure list; Bitget supplies no completeness/coverage guarantee, which remains a provider limitation.

**Live-data limitation:** the response on September 18 reports `standard` / `EST`, while New York's timezone rules resolve `dst` / EDT on that date. The engine therefore reports UNKNOWN with a precise conflict diagnostic. It does not ignore Bitget metadata, force a one-hour shift, or manufacture an open session. This replaces the previous missing-current-field limitation with a concrete, testable inconsistency in the provider inputs.

## Reference selection and runtime

REGULAR selects existing Alpaca IEX latest trades; OVERNIGHT selects the verified Alpaca `feed=overnight` indicative quote midpoint. PRE_MARKET, AFTER_HOURS, CLOSED and UNKNOWN withhold references and comparisons. Bid and ask remain preserved for selected overnight references, and only valid two-sided quotes produce midpoints.

Extended-hours investigation reviewed [Alpaca feed coverage](https://docs.alpaca.markets/us/v1.4.2/docs/about-market-data-api) and [overnight-data documentation](https://docs.alpaca.markets/us/docs/245-trading-for-trading-api). Existing verified access is IEX plus overnight indicative quotes. The latest IEX observations previously returned stale regular-session trades, and overnight indicative data is an overnight product. No fresh appropriate pre/after-hours feed has been verified for this account, so none is invented or substituted. No SIP subscription, delayed SIP, BOATS trade feed, alternate session service, or order/account endpoint was added.

The 60-second age and 30-second timestamp-separation policy is unchanged. A valid resolved session never overrides freshness or validates a stale previous-session trade. When no session feed is eligible, Alpaca is not unnecessarily queried.

Raw Bitget schedule/calendar inputs are cached for 10 seconds with request coalescing; the resolved session is never cached. The engine runs before selecting a feed and again after the reference fetch. Crossing a session boundary cannot reuse the previous session's feed. Feed caches remain isolated. Any reference missing after a transition is withheld until a subsequent refresh.

Every normalized asset exposes `marketSession`, `sessionSource`, `sessionEvaluatedAt`, reference source/type, comparison status and both observation timestamps. The response also provides `sessionDiagnostics`: evaluation time, local wall time, explicit zone, reported/resolved daylight type, and issue. The existing detail panel shows session provenance without a redesign.

## Files and verification

Added `lib/market/resolve-session.ts` and `tests/session-engine.test.ts`. Updated Bitget session transport, market orchestration, types/defaults, detail metadata, stage labels, `scripts/verify-local.mjs`, and documentation/evidence. All 51 pre-existing tests remain; 40 additional fixed-time cases cover phases, boundaries, midnight, weekends, holidays, special closures, DST/standard time, timezone independence, malformed data and reference integration. No tests depend on the current clock.

### Final Stage 2.6 live verification

TypeScript, ESLint, **91/91 tests**, and the production build passed. The app was restarted and the local integration check passed: dashboard and `/api/market` HTTP 200, POST 405, and all three Bitget instruments LIVE.

[Actual normalized response](docs/stage26-market-response.json), captured at **2026-09-18T13:28:19.107Z**, contains:

| Asset | Bitget USDT | Bitget snapshot timestamp (UTC) |
| --- | --- | --- |
| AAPL | 337.65 | 2026-09-18T13:28:17.527Z |
| NVDA | 219.79 | 2026-09-18T13:28:17.336Z |
| TSLA | 368.62 | 2026-09-18T13:28:17.525Z |

Resolved session: **UNKNOWN**. Source: **Bitget Reality schedule + calendar**. Selected Alpaca feed: **none**. Session diagnostics show provider `standard` versus timezone-derived `dst`, so references and dislocations are null. No fresh synchronous comparison was obtained. Valid fixture-based REGULAR and OVERNIGHT cases do activate the existing selector and calculate fresh comparisons; the live provider conflict is not bypassed or overridden.

Remaining limitations are contradictory live timezone metadata, ambiguous weekend overnight reopening and EST calendar boundaries (conservatively withheld), no verified pre/after-hours reference strategy, and no FX adjustment. The dashboard was verified through its server-rendered response; interactive/visual browser QA remains unavailable in this environment. No AI investigation layer or Stage 3 work was started.

## Stage 2.5 implementation history

Stage 2.5 adds authenticated Alpaca overnight indicative quotes, midpoint normalization, deterministic session-based selection, and detail-panel provenance. No AI, MCP, orders, trading, wallets or AgentRouter is included. The Stage 2 documentation below is retained as implementation history; this section describes the current selection behavior.

## Overnight access and observed schema

On 2026-09-18 at 08:00:48.798 UTC, the existing account returned **HTTP 200** from:

`GET https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=AAPL,NVDA,TSLA&feed=overnight&currency=USD`

Authentication remains server-only `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` headers. No secrets are in the evidence. [Sanitized access evidence](docs/overnight-access.json) contains actual quotes, including this subset of the provider response:

```json
{"quotes":{"NVDA":{"bp":221.64,"ap":221.72,"t":"2026-09-18T08:00:00.641095401Z"}}}
```

`bp` and `ap` are bid and ask; `t` is one quote timestamp. There are no separate bid/ask timestamps in this consumed schema, and none are invented. The indicative midpoint of that captured quote is 221.68 USD. It is not a trade price or official consolidated US-stock price.

The normalizer preserves both sides and `t`, records `feed=overnight` from the explicit request, and uses `INDICATIVE_MIDPOINT`. Both sides must be finite positive numbers and bid must not exceed ask; otherwise the reference price is null. Missing/invalid/future timestamps cannot yield a usable comparison. HTTP 403 and other provider failures are handled explicitly without falling back to IEX.

Documentation: [Latest quotes](https://docs.alpaca.markets/us/reference/stocklatestquotes-1), [Alpaca overnight indicative data](https://docs.alpaca.markets/us/docs/245-trading-for-trading-api), [quote fields](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data).

## Bitget session investigation: current limitation

The documented public endpoint `GET https://api.bitget.com/api/v3/reality/market/states` returned HTTP 200. Its live `data` was an object containing `market`, `daylightType`, and `stateList`; the documentation describes `data` as an array. `stateList[*].state` contained **all four schedule entries** (`pre_market`, `regular`, `after_hours`, `overnight`), with start/end times. There was **no verified field identifying the active session**. `requestTime` is response time, not session state. [Actual response](docs/bitget-session-observed.json); [Bitget documentation](https://www.bitget.com/docs/catalog/reality/market-data).

Consequently, this endpoint cannot reliably identify the current US session for the present implementation. `marketSession` is **UNKNOWN**, not a guess based on the local clock, schedule order, daylight-saving label, or last quote time. No separate current-session field is invented. Session transport failures also yield UNKNOWN. A one-entry schedule is not treated as proof of an active session.

## Deterministic selection and freshness

| Verified session | Selected reference |
| --- | --- |
| REGULAR | Alpaca IEX latest trade (`TRADE`) |
| OVERNIGHT | Alpaca overnight latest quote midpoint (`INDICATIVE_MIDPOINT`) |
| PRE_MARKET / AFTER_HOURS / CLOSED / UNKNOWN | No verified suitable strategy; withhold reference and comparison |

The selection layer supports these normalized states but **the current Bitget adapter returns UNKNOWN**, because a reliable active-session field is absent. Thus automatic live session-aware comparisons are blocked by session identification, despite successful overnight feed access. The regular/overnight branches are tested with explicitly labeled synthetic session fixtures, not claimed as observed live session states.

The existing **60-second maximum observation age / 30-second maximum timestamp separation** policy is unchanged. No provider behavior justified relaxing it. Comparisons are only calculated after price/time validation and these gates. No stale previous-session fallback is allowed. Selected stale quotes retain their observed midpoint/bid/ask for inspection while comparison numbers remain null; an unknown session selects no quote at all.

Every asset now includes `referenceType`, `referenceBid`, `referenceAsk`, source, timestamp, normalized session, and comparison status. Unknown-session references have null price/source/type/bid/ask and null dislocation. The detail panel displays indicative labels, bid/ask/mid, both observation timestamps, session and freshness. Provider requests remain server-side and coalesced with a 10-second cache; feed status is visible in factual system events. Session schedules are polled at most once per cache refresh per process, under the documented 1 request/second/IP limit for a single process.

New files: `lib/alpaca/quotes.ts`, `lib/bitget/session.ts`, `lib/market/session.ts`, `lib/market/select.ts`, `tests/overnight.test.ts`, and sanitized evidence in `docs/`. Updated Alpaca transport/types, market orchestration/merge/types, Bitget normalization defaults and existing dashboard/detail components. No dependency additions.

### Stage 2.5 quality gate

TypeScript, ESLint, all **51 tests** (including all 38 existing tests), and the production build passed. The production server was restarted and `node scripts/verify-local.mjs` passed: dashboard HTTP 200, market API HTTP 200, POST 405, all three real Bitget prices LIVE, and unknown-session comparisons withheld. [Full normalized response](docs/stage25-market-response.json), captured at `2026-09-18T08:07:50.556Z`, includes AAPL 336.58 USDT with Bitget timestamp `2026-09-18T08:07:47.100Z`, `marketSession=UNKNOWN`, and null reference/dislocation fields.

**No fresh synchronous comparison was observed.** Overnight access and quote normalization work, but current-session identification remains unavailable from the verified Bitget response. No alternative session provider, local-clock inference, or override was added. The dashboard's server-rendered content was verified; browser visual/interaction QA remains unavailable in this environment. The existing verification script now targets Stage 2.5; `--expect-alpaca` requires an actually selected reference and will intentionally fail while the current session remains UNKNOWN.

## Stage 2 implementation history

NightShift is a read-only intelligence desk for Bitget Reality tokenized US equities. Stage 2 adds **Alpaca IEX underlying-reference trades** and a deterministic, freshness-gated raw price comparison. The Stage 1 Bitget monitor remains independent. No AI, LLM, MCP, AgentRouter, news, wallet, contract, or trading/order functionality is included.

## Install and run

Requires Node.js 22.18+ (verified on Node 24.20.0). The TypeScript tests use Node's native type stripping, with no additional test dependencies.

```sh
npm ci
# Copy .env.example to .env.local and enter your Alpaca credentials locally.
npm run dev
```

Open http://localhost:3000. On PowerShell systems that prohibit npm.ps1, use `npm.cmd` instead of `npm`.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Restart the server after changing credentials. Never paste credentials into chat, logs, source files, or screenshots. No Alpaca connector/plugin is needed: the app calls the documented Market Data REST API directly.

## Environment and authentication

| Variable | Purpose |
| --- | --- |
| `APCA_API_KEY_ID` | Alpaca key ID, sent as `APCA-API-KEY-ID` HTTP header from server code (supports legacy `APCA-API-KEY-ID`). |
| `APCA_API_SECRET_KEY` | Alpaca secret, sent as `APCA-API-SECRET-KEY` HTTP header from server code (supports legacy `APCA-API-SECRET-KEY`). |
| `MARKET_STALE_AFTER_MS` | Stage 1 Bitget snapshot freshness setting; default 60000 ms, valid range 1000–300000. The cross-market policy independently caps acceptable ages at 60000 ms. |

Alpaca variables are empty in `.env.example`. Missing credentials are a supported degraded state: Bitget still loads, `referencePrice` and `rawDislocationPercent` are null, and the issue identifies the unavailable underlying reference. `.env.local` and other environment files are ignored by Git. Secrets are never passed to client components; server-only entry points enforce the boundary. Upstream response bodies and exceptions are not returned to the client or logged, preventing accidental secret disclosure. Authentication is used solely for market data.

## Verified provider endpoints

Documentation verified 2026-09-18:

| Provider | Endpoint | Use |
| --- | --- | --- |
| Bitget | `GET https://api.bitget.com/api/v3/market/instruments?category=SPOT` | Confirm actual Reality instruments using `isReality=yes`, base coin, quote coin, and status. |
| Bitget | `GET https://api.bitget.com/api/v3/market/tickers?category=SPOT&symbol={confirmedSymbol}` | Last tokenized price and Bitget snapshot `ts`. |
| Alpaca | `GET https://data.alpaca.markets/v2/stocks/trades/latest?symbols=AAPL,NVDA,TSLA&feed=iex&currency=USD` | One batch request for latest eligible IEX trades. |

Bitget is unauthenticated. Alpaca uses `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` request headers over HTTPS. There are no SDK or new package dependencies.

Sources: [Alpaca latest multi-symbol trades](https://docs.alpaca.markets/us/v1.4.2/reference/stocklatesttrades-1), [Alpaca market-data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq), [Bitget instruments/tickers](https://www.bitget.com/docs/catalog/market/market-data), [Bitget Reality metadata](https://www.bitget.com/docs/catalog/reality/market-data).

The verified Bitget `GET /api/v3/reality/market/stock-info` remains a Stage 1 research endpoint, not a runtime data source. Its observed metadata does **not** supply the underlying US-stock reference price needed for dislocation.

## Architecture and changed files

```text
Browser / server-rendered dashboard
                  |
          lib/market/client.ts  <---- GET /api/market
                  |
      concurrent independent providers
          /                      \
lib/bitget/client.ts       lib/alpaca/client.ts (server-only credentials)
  discovery + tickers       request.ts -> multi-symbol IEX latest trades
          \                      /
             lib/market/merge.ts
             freshness + mapping
             calculateDislocation()
```

- **Added** `lib/alpaca/{client,request,normalize,types}.ts`: authenticated transport, runtime validation, provider-error isolation, typed normalization.
- **Added** `lib/market/{client,merge,policy,symbols,presentation}.ts`: orchestration, explicit mapping, policy, comparison and display-age reevaluation.
- **Added** `components/AssetDetail.tsx`, `app/stage2.css`: compact selectable detail panel and targeted style extensions.
- **Changed** `components/AssetRow.tsx`, `components/MarketMonitor.tsx`: distinct provider prices/statuses, raw percentage/direction, ages, IEX disclosure and detail selection.
- **Changed** `lib/bitget/types.ts`, `lib/bitget/normalize.ts`: additive reference/comparison fields; Bitget transport and discovery remain unchanged.
- **Changed** `app/api/market/route.ts`, `app/page.tsx`, `app/layout.tsx`: merged server data and Stage 2 styles.
- **Added** `tests/alpaca.test.ts`, `tests/cross-market.test.ts`; existing calculator and Bitget tests remain unchanged.
- **Changed** `.env.example`, `README.md`; preserved the previous report as `docs/stage1-readme.md`.

Each provider has an 8-second request timeout. Requests run concurrently. Provider caches are per process with a 10-second lifetime and in-flight request coalescing. The browser polls every 15 seconds, reevaluates displayed ages every second, and times out its request at 20 seconds. Every server response reevaluates freshness, including cache hits. No provider failure is replaced with mock data or stale cache fallback.

## Normalization and mapping

| Confirmed Bitget pair | Alpaca symbol |
| --- | --- |
| `RAAPLUSDT` | `AAPL` |
| `RNVDAUSDT` | `NVDA` |
| `RTSLAUSDT` | `TSLA` |

Only exact mappings are accepted; Alpaca symbols do not cause unconfirmed Bitget rows to be invented. Discovery still checks the actual Bitget instruments. A failed Bitget ticker preserves the reference but supplies no fabricated tokenized price. Failed Bitget discovery produces no asset rows and HTTP 502. Alpaca failure leaves Bitget quotes visible and returns HTTP 200 with explicit per-provider and comparison error status.

Alpaca's `trades[symbol].p` becomes `price`; `t` becomes `timestamp` with its original fractional precision preserved. `feed: iex` and `currency: USD` are explicit request metadata, not invented response fields. Numeric ages and timestamp separation use millisecond precision. Prices must be finite, numeric, and positive; timestamps must be valid UTC strings and no more than five seconds in the future. A missing or invalid symbol is unavailable without taking another symbol's price.

The normalized asset includes all requested fields plus `referenceCurrency`, `absoluteDifference`, signed `priceDifference`, `bitgetStatus`, `referenceStatus`, `comparisonStatus`, `tokenizedAgeMs`, `referenceAgeMs`, `timestampSkewMs`, and `comparisonAsOf`. `dataStatus` describes the combined comparison; provider statuses remain independent. `referenceAvailable` means at least one reference price was returned, not necessarily that a fresh comparison is possible.

## Freshness policy

Both observations must be **at most 60 seconds old**, and their timestamps must be **at most 30 seconds apart**, to calculate a dislocation. These conservative limits allow normal REST polling/network variation while refusing minute-old or widely separated observations. They are monitoring heuristics, not a guarantee that prices were simultaneously executable. See `lib/market/policy.ts`.

- Fresh compatible observations: `comparisonStatus=AVAILABLE`, deterministic percentage and PREMIUM/DISCOUNT/FLAT direction.
- Either side older than 60 seconds: `comparisonStatus=STALE`, `dataStatus=DELAYED`.
- Fresh observations separated by over 30 seconds: `comparisonStatus=ASYNCHRONOUS`, `dataStatus=DELAYED`.
- Missing/invalid data or credentials: `UNAVAILABLE`.
- Provider/transport failure: `ERROR`, with unaffected provider prices preserved.

For every unavailable, stale, asynchronous, or failed comparison, **all comparison numbers and direction are null**. Observed older prices remain visible with timestamps, ages and DELAYED labels, but are not silently compared. The browser also removes comparisons when their freshness window expires between network polls.

## Interpretation and limitations

**Underlying reference uses Alpaca IEX market data and may differ from consolidated SIP pricing.** Basic/free coverage is IEX only, not the consolidated US market. We explicitly request `feed=iex` rather than relying on a subscription-dependent default. Latest trades exclude certain trade conditions, and the last eligible IEX trade can be old, particularly outside active IEX hours or on holidays. A successful HTTP response does not imply a fresh trade. No overnight, SIP, quote, or other fallback feed is substituted.

Bitget `ts` describes a system-generated ticker snapshot; Alpaca `t` describes an actual trade. Even matching times do not establish identical market observations. Session remains `unknown`: neither a local clock nor stale last-trade data is treated as a verified exchange session.

The raw calculation compares a **USDT tokenized quote** numerically to a **USD stock trade**:

```text
priceDifference = tokenizedPrice - referencePrice
absoluteDifference = abs(priceDifference)
rawDislocationPercent = priceDifference / referencePrice * 100
```

The existing calculator handles floating-point noise and determines premium/discount/flat. **No USDT/USD conversion, FX adjustment, corporate-action adjustment, token entitlement adjustment, fees, spreads or execution assessment is included.** Values are explicitly labeled raw, not currency-normalized or executable opportunities. The absolute difference has no single shared currency unit and is not labeled with a dollar sign.

Per-process caching is not distributed rate limiting. Deployment at scale would need shared controls. No persistent event history is added. Synthetic test fixtures are labeled in test files and never served by the application.

## Validation and evidence

The Stage 1 real response remains in `docs/market-response.json`, clearly dated and not used as fallback data. It is not evidence of an Alpaca connection.

Stage 2 automated checks cover Alpaca normalization, batch transport/authentication, mapping, successful merges, missing data/credentials, stale references, stale Bitget quotes, timestamp separation, HTTP/network/timeout/schema failures, independent provider behavior, and deterministic calculation integration. All original Stage 1 tests are retained.

Live Alpaca verification requires credentials in `.env.local`. Authenticated verification succeeded on 2026-09-18; the real merged response is in [docs/stage2-cross-market-response.json](docs/stage2-cross-market-response.json). The returned IEX trades were stale, so the comparison policy correctly withheld dislocation values.

With the production server running, `node scripts/verify-local.mjs` verifies real Bitget rows, required server-rendered dashboard content, detail selectors, and GET-only API behavior. `node scripts/verify-local.mjs --expect-alpaca` additionally requires actual returned reference prices and timestamps. The script writes the observed normalized response under `docs/`; it never generates market values. A stale real reference is acceptable evidence of provider connectivity, but never enables a stale comparison.

No Stage 3 work is included.

### Initial Stage 2 validation — 2026-09-18, before credentials

- TypeScript, ESLint, and production build passed; 38/38 tests passed, including all 15 original Stage 1 tests.
- The production app started at `http://127.0.0.1:3000`. Dashboard and `/api/market` returned HTTP 200; POST returned 405.
- The server-rendered dashboard contained all three actual instrument rows, provider labels, the IEX disclosure, and three accessible detail-selection buttons. Browser/visual/interaction QA remains unverified because no browser surface was available.
- The live local response at `2026-09-18T07:47:39.102Z` is preserved in [docs/stage2-local-response.json](docs/stage2-local-response.json). Bitget returned AAPL 337.15, NVDA 221.74, and TSLA 369.17 USDT with LIVE snapshots.
- **Blocked:** Alpaca credentials were not configured. Reference prices and comparisons were correctly null; Bitget continued working. No live Alpaca response, real cross-provider price difference, or successful live comparison is claimed. Finish the live quality gate after entering credentials locally and restarting the app, then run `node scripts/verify-local.mjs --expect-alpaca`.

### Final live verification — 2026-09-18T07:55:43.915Z

The credential blocker above is resolved. The production server was restarted to load `.env.local`; no credential values were printed, copied into artifacts, or sent to client components. `node scripts/verify-local.mjs --expect-alpaca` passed with real positive Alpaca IEX references and Bitget quotes for all three assets. Dashboard and API returned HTTP 200; POST returned 405. The full normalized response is saved in [docs/stage2-cross-market-response.json](docs/stage2-cross-market-response.json).

| Asset | Bitget (USDT) | Alpaca IEX (USD) | Bitget snapshot (UTC) | IEX trade (UTC) |
| --- | --- | --- | --- | --- |
| AAPL | 337.26 | 337.09 | 2026-09-18T07:55:41.607Z | 2026-09-17T19:59:59.838724479Z |
| NVDA | 221.79 | 219.40 | 2026-09-18T07:55:41.605Z | 2026-09-17T19:59:59.915323379Z |
| TSLA | 369.16 | 366.02 | 2026-09-18T07:55:42.225Z | 2026-09-17T19:59:59.231542737Z |

All three Bitget snapshots were LIVE. The IEX trades were about 11 hours 56 minutes old, so `referenceStatus=DELAYED`, `comparisonStatus=STALE`, and every comparison number/direction was null. This verifies actual authenticated provider data and correct stale-data handling; it does **not** demonstrate a fresh simultaneous comparison. No stale threshold was relaxed to produce a number.

For calculator verification only, the captured, non-synchronous values produce numeric gaps of +0.17 (+0.0504316354683%) for AAPL, +2.39 (+1.08933454877%) for NVDA, and +3.14 (+0.857876618764%) for TSLA. These are arithmetic checks against different observation times and different quote currencies, not current dislocation signals or execution assessments. The live API correctly did not expose them as comparisons. Re-merging the captured data at its recorded evaluation time also reproduced STALE/null for every asset.

All 38 tests, TypeScript, and ESLint passed again after credential setup. The previously verified production build was reused unchanged; only verification evidence and documentation changed in this final pass. Server-rendered dashboard verification passed; visual browser/detail-interaction QA remains unavailable because the environment has no connected browser. Session remains unknown, IEX is not consolidated SIP, and no FX conversion is performed. Stage 2 ends here; no Stage 3 functionality was added.
