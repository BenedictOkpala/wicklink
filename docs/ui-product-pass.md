# NightShift research workspace

The UI pass preserves the Stage 2.7 data architecture, providers, API, session engine, calculations, and 60-second/30-second freshness policy. SHA-256 checks against `ui-data-baseline.json` confirm all existing library, API-route, and dependency files are unchanged.

## Product changes

- Navigation, workflow strip, market overview, selected research workspace, factual activity snapshot, provider transparency, and system status.
- Selecting any market row updates its detail workspace in place. Asset buttons provide keyboard selection and selected-state semantics.
- Markets, Investigations, Data Sources, and System Status switch views without leaving the application. The investigation action preserves asset context and explicitly states that no investigation has started. No agent functionality was added.
- Detail sections expose market evidence, reference provenance, bid/ask for indicative midpoints, observation timestamps, freshness status, and collapsed technical diagnostics.
- Small differences use restrained styling and extra decimal precision. Premium, discount, flat, and withheld states have text labels.
- Desktop uses a persistent sidebar and research/activity columns; tablet uses a compact navigation rail and stacked research panels; mobile uses navigation tabs, structured asset cards, and stacked details. Focus outlines, skip navigation, and reduced-motion support are included.
- Loading disables refresh and marks the market panel busy. Failed refreshes hide previous quotes. Delayed/unavailable/error observations retain explicit reasons; stale comparisons remain withheld by the existing freshness projection. Activity is labeled as the last received snapshot.

## Verification

- TypeScript: passed.
- ESLint: passed.
- Tests: 107 passed (all 102 existing tests plus five UI state/format tests).
- Production build: passed; application restarted at http://127.0.0.1:3000.
- Dashboard and GET `/api/market`: HTTP 200. POST remains HTTP 405.
- Live snapshot at 2026-09-18T13:57:36.711Z: REGULAR session, Alpaca IEX, all three comparisons AVAILABLE. AAPL: 335.03 USDT / 335.01 USD, +0.00596997104563%; NVDA: 219.53 / 219.53, flat; TSLA: 367.39 / 367.44, -0.0136076638363%. These are observed verification values, never application fallbacks.
- `scripts/verify-ui.mjs` checks actual row and navigation callbacks, investigation entry, SSR asset prices/dislocations/timestamps, empty and unavailable/delayed/error rendering, transparency views, and frozen architecture hashes.
- Live response evidence: `ui-market-response.json`.

## Limits

Browser tooling exposed no available browser. No desktop/tablet/mobile screenshots, browser hydration checks, or browser interaction/layout inspection could be performed. Component callback, reducer, and server-rendering checks passed; responsive layout and loading styling still need visual browser QA. Investigation functionality remains intentionally inactive. No Stage 3 work was started.
