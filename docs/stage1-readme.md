# NightShift — Stage 1

NightShift is an AI intelligence desk for Bitget tokenized US equities. This stage establishes **real, read-only market data** and a deterministic dislocation calculator. It does not implement an AI agent, MCP, external TradFi feeds, wallets, contracts, orders, or trading.

## Install and run

Node.js 22.18+ is required for the dependency-free TypeScript test runner. Verified on Node 24.20.0.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. On Windows with PowerShell script restrictions, use `npm.cmd` instead of `npm`.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Next.js 16.3.5, React 19.3.0, Tailwind 4.3.3, and TypeScript 5.9 are pinned or lockfile-resolved. ESLint 9 is retained because the current `eslint-plugin-react` peer range does not support ESLint 10; npm reports its upstream end-of-support warning. No runtime issue was found. Do not force incompatible peer dependencies simply to silence this warning.

## Environment and security

No credentials or secrets are needed. Optionally copy `.env.example` to `.env.local`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MARKET_STALE_AFTER_MS` | `60000` | Server ticker-snapshot freshness cutoff; accepted range 1000–300000 ms; invalid values fall back to default. |

The Bitget origin and read-only paths are fixed server-side. There are no `NEXT_PUBLIC` secrets, authenticated calls, order handlers, or wallet connections. Environment files are ignored by Git except `.env.example`.

## Architecture and files

```text
app/layout.tsx                 Document metadata and global styles
app/page.tsx                   Server-rendered initial market snapshot
app/globals.css                Responsive dark terminal styling / Tailwind
app/api/market/route.ts        GET-only normalized JSON endpoint
components/MarketMonitor.tsx   Client polling, connection state, factual events
components/AssetRow.tsx        Asset quote and availability display
components/StatusBadge.tsx     LIVE / DELAYED / UNAVAILABLE / ERROR
lib/bitget/client.ts           Server-only fetch, timeout, coalescing, short cache
lib/bitget/types.ts            Application and consumed upstream field types
lib/bitget/normalize.ts        Runtime validation and typed normalization
lib/bitget/symbols.ts          Three-candidate registry with live confirmation
lib/dislocation/calculate.ts   Pure deterministic calculator
tests/dislocation.test.ts     Calculator tests
tests/market.test.ts           Discovery, schema, freshness, missing-data tests
docs/market-response.json      Captured real normalized response, not a live feed
.env.example                  Optional server configuration
package.json / package-lock.json / tsconfig.json
eslint.config.mjs / postcss.config.mjs / next-env.d.ts / .gitignore
```

The browser requests only `/api/market`. The server discovers actual Reality instruments before requesting each ticker. Initial HTML includes the market snapshot; subsequent refreshes run every 15 seconds. Concurrent requests share an in-flight fetch, and results are cached for 10 seconds per process. Each upstream fetch has an 8-second timeout. Client requests have a 20-second timeout. Partial ticker failures are isolated to their asset; discovery failure returns HTTP 502 with a structured error payload. Failed client requests hide old quotes. Refresh is available manually.

## Verified Bitget endpoints

Documentation and unauthenticated live responses checked on **2026-09-18**:

| Endpoint | Usage |
| --- | --- |
| `GET https://api.bitget.com/api/v3/market/instruments?category=SPOT` | Runtime discovery; require `isReality: "yes"`, matching base coin, USDT quote; retain actual symbol casing and instrument status. |
| `GET https://api.bitget.com/api/v3/market/tickers?category=SPOT&symbol=RAAPLUSDT` | Runtime last price and snapshot timestamp. Also called with `RNVDAUSDT` and `RTSLAUSDT`. |
| `GET https://api.bitget.com/api/v3/reality/market/stock-info` | Research verification only, not polled by the app. Verified metadata and absence of underlying stock-price fields. |

Sources: [Reality trading guide](https://www.bitget.com/docs/uta/reality-trading-guide), [instruments and tickers](https://www.bitget.com/docs/catalog/market/market-data), [Reality stock information](https://www.bitget.com/docs/catalog/reality/market-data).

Confirmed online instruments: **rAAPL → RAAPLUSDT, rNVDA → RNVDAUSDT, rTSLA → RTSLAUSDT**. These are candidates until confirmed by each discovery request; no fabricated fallback instruments or quotes are served. Company display names are local registry labels; the captured stock-info names for these three were null.

Bitget's guide contains a broad whitelist note despite labeling instruments/tickers public. The actual endpoints used here succeeded without authentication. Authenticated Reality order-book and fills APIs are deliberately excluded.

## Real normalized response

The complete `/api/market` response captured at `2026-09-18T07:20:18.678Z` is in [docs/market-response.json](docs/market-response.json). One asset from that response:

```json
{
  "symbol": "AAPL",
  "displayName": "Apple Inc.",
  "tokenizedSymbol": "RAAPLUSDT",
  "quoteCurrency": "USDT",
  "tokenizedPrice": 337.06,
  "tokenizedTimestamp": "2026-09-18T07:20:15.855Z",
  "referencePrice": null,
  "referenceTimestamp": null,
  "marketSession": "unknown",
  "rawDislocationPercent": null,
  "dataStatus": "LIVE",
  "issue": null
}
```

This is historical evidence of a real API call, not mock data or a price forecast. It is never loaded as application fallback data.

## Reference pricing and other limitations

**The verified stock-info endpoint does not provide the underlying US-equity reference price required for dislocation.** Its observed fields are `symbol`, `code`, `name`, `tradingPeriod`, and `weekendTradable`. Ticker `lastPrice` is a tokenized quote; documented `indexPrice` and `markPrice` are futures-only and are not used as an underlying stock reference. Reference price, reference timestamp, and dislocation therefore remain null. No external provider has been added.

US session remains `unknown`: stock-info lists eligible sessions, not a verified current exchange session. The documented states/calendar endpoints were reviewed but not integrated; calendar/time-zone/holiday handling is not guessed. USDT is labeled explicitly and is not equated with USD. A future reference comparison would also need compatible currency, timestamps, and token/share units.

`LIVE` means a positive quote from an online instrument with a Bitget snapshot timestamp within the configured freshness cutoff. It does not establish the age of the last trade. `DELAYED` means the snapshot is older; `UNAVAILABLE` means absent/invalid quote, timestamp, or offline instrument; `ERROR` means an upstream request or validation failed. Timestamp values are UTC ISO strings sourced from ticker `ts`, not local receipt time. `fetchedAt` is local receipt time. The activity panel records actual fetch events; no simulated reasoning is present.

The calculator rejects non-numeric, non-finite and non-positive inputs. It returns the nonnegative absolute price gap, signed percentage relative to the reference, and premium/discount/flat direction. It treats differences within four scaled machine epsilons as flat and rounds outputs to 12 significant digits. It is tested independently but not called for market rows because a real reference price is absent.

The in-memory cache is per process, not a distributed rate limiter. Large-scale hosting would require shared caching/rate limiting. The app currently polls rather than using WebSockets and has no persistent event store. No hosting or Stage 2 work is included.

## Stage 1 validation

- Dependencies installed; audit reported zero vulnerabilities.
- TypeScript and ESLint pass.
- 15 automated tests pass, including premium, discount, equal, invalid, and zero reference cases.
- Production build passes.
- Production server starts locally; dashboard and `/api/market` return HTTP 200.
- Real Bitget discovery and ticker calls returned all three requested assets, with LIVE snapshot status in the captured response.
- Server-rendered dashboard HTML is checked for the actual asset rows and required panels. Interactive browser/visual QA is unavailable in this environment: browser discovery returned no browser and the in-app browser could not be opened. Responsive CSS is implemented, but visual viewport checks are not claimed.

Stage 1 stops here.
