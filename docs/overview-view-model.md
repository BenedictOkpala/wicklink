# Overview preparation — no visual changes

## Baseline before implementation

Verified on 2026-09-20:

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd test` | 157 passed |
| `npm.cmd run build` | Passed |
| `node scripts/verify-ui.mjs` | Passed, including existing frozen-file hashes |
| `node scripts/verify-scrollspy.mjs` | Passed |
| `node scripts/verify-brand.mjs` | Passed against local production app |
| `node scripts/verify-v2-features.mjs` | Passed against local production app |

The initial sandbox attempts could not spawn test/build workers (`EPERM`). Authorized execution with child-process access passed; these were environment failures, not failing assertions.

Live baseline: 14 assets, CLOSED session, DELAYED aggregate status and STALE comparisons. NVDA, AAPL and TSLA investigation contracts passed using the deterministic fallback (`AI_ANALYSIS_UNAVAILABLE`). No successful AI synthesis is claimed.

### Existing verification limitations

- `verify-local.mjs` is stale: exactly three assets/three detail controls, a timezone text marker no longer rendered there, and null off-hours reference prices conflict with the current 14-asset/context-retention implementation. It also writes a dated response artifact. Not run or modified.
- `verify-continuous.mjs` requires an obsolete Overview hero sentence. Not run or modified; the current brand/UI checks were used instead.
- `verify-cycles.mjs` relies on a hardcoded private-network IP. Not used.
- `verify-viewports.mjs` and `verify-all-mobile-interactions.mjs` require a hardcoded Windows Edge executable/CDP ports, create temporary browser profiles, and depend on live provider data. Not used for this nonvisual module change; no browser-layout verification is claimed.
- `verify-ui.mjs` passed, but uses private React dispatch internals and a stored snapshot. It is component/SSR verification, not real hydration testing.
- `verify-scrollspy.mjs` checks a copied algorithm, not an imported application function.
- V2 checks require current provider access and exactly 14 discoverable instruments; six hypotheses are also assumed. Their passing result is an observation, not an offline guarantee.

## Files and integration boundary

Created only:

- `lib/overview/types.ts`: public typed contract.
- `lib/overview/ranking.ts`: independently testable ranking function.
- `lib/overview/view-model.ts`: pure canonical-state projection and shortlist selection.
- `tests/overview.test.ts`: 26 focused tests.
- This document.

No existing UI, CSS, navigation, provider, calculator, investigation, or MarketMonitor source was changed. The module is deliberately **not wired into OverviewView yet**. Existing sparklines/KPIs/details remain untouched until the separate presentation rebuild.

The future caller must supply assets already processed by the existing freshness projection (`ageAsset`) and an explicitly supplied canonical session. The module never reads a clock, resolves a session, fetches data, calls AI, recomputes prices/dislocations, or mutates the input. It checks canonical field consistency before exposing a difference, without becoming a second freshness engine. Callers must keep supplying newly aged assets as time passes.

## Exact public contract

`buildOverviewViewModel(input: OverviewInput): OverviewViewModel`

Input:

```ts
{
  assets: readonly MarketAsset[];
  marketSession: MarketSession;
  limit?: 3 | 4 | 5; // default 5; other runtime values throw
  surveillance?: {
    fetchedAt?: string | null;
    snapshotAgeMs?: number | null;
    refreshing?: boolean;
    connection?: 'CONNECTED' | 'ERROR' | 'UNKNOWN';
  };
}
```

Output:

```ts
{
  marketSession: MarketSession;
  mode: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'OVERNIGHT' | 'CLOSED' | 'UNKNOWN';
  context: string;
  surveillance: SurveillanceContext;
  totalMonitoredAssetCount: number;
  counts: { live: number; indicative: number; withheld: number; worthWatching: number };
  liveCandidates: OverviewAsset[];
  indicativeCandidates: OverviewAsset[];
  selectedGroup: 'LIVE' | 'INDICATIVE' | 'NONE';
  displayedAssets: OverviewAsset[];
  limit: 3 | 4 | 5;
}
```

Each `OverviewAsset` contains:

- Identity: `symbol`, `displayName`, `tokenizedSymbol`.
- Canonical values: `tokenizedPrice`, `referencePrice`, `quoteCurrency`, `referenceCurrency`.
- Canonical states: `marketSession`, `comparisonStatus`, `dataStatus`, `bitgetStatus`, `referenceStatus`.
- `comparison`: `{ kind: 'LIVE' | 'INDICATIVE', percent: number, direction: 'premium' | 'discount' | 'flat' }` or `{ kind: 'WITHHELD', percent: null, direction: null }`.
- Presentation facts: `context`, `worthWatching`.
- Investigation capability: `investigationAvailable`, `investigationUnavailableReason`.
- Provenance: `referenceSource`, `referenceType`, `referenceBid`, `referenceAsk`.
- Time/freshness metadata: `tokenizedTimestamp`, `referenceTimestamp`, `tokenizedAgeMs`, `referenceAgeMs`, `timestampSkewMs`, `comparisonAsOf`.
- Cautions: `requiresCaution`, `cautions`, `issue`.

Caution codes are `UNKNOWN_SESSION`, `SESSION_MISMATCH`, `COMPARISON_WITHHELD`, `STALE_OBSERVATION`, `TIMESTAMP_MISMATCH`, `PROVIDER_ERROR`, `REFERENCE_PROVENANCE_MISSING`, `SINGLE_EXCHANGE_REFERENCE`, `INDICATIVE_MIDPOINT`, `INDICATIVE_COMPARISON`, and `CURRENCY_BASIS`. Cautions include provenance disclosures and do not automatically mean a candidate is invalid. Canonical `issue` is preserved separately; generic Overview copy does not repeat inaccurate existing “Last Close” labels.

Additional pure exports:

- `toOverviewAsset(asset, marketSession)` exposes the projection, including WITHHELD states even when no asset is shortlisted.
- `rankOverviewCandidates(projectedAssets, kind, limit = 5)` filters one comparison kind, sorts and caps without mutation. Eligibility projection should precede ranking.

## Ranking and semantic policy

1. Rank each eligible group by descending absolute canonical percentage. Ties use symbol, then tokenized symbol, using code-point comparison independent of locale and input order. No historical, persistence, liquidity or news score is added.
2. Return at most five (or explicitly three/four) candidates per diagnostic group. `displayedAssets` is the sole Overview shortlist: at most the selected limit **in total**, always from one group. Never concatenate or pad from another group.
3. Prefer LIVE whenever available. Otherwise select INDICATIVE only for PRE_MARKET, AFTER_HOURS, OVERNIGHT or CLOSED. Regular-session indicative context can be counted/projected but is not an Overview fallback.
4. UNKNOWN preserves its identity and withholds all candidate differences. A row/session mismatch is withheld without rewriting the row's original session.
5. A fresh, canonically AVAILABLE overnight midpoint is a LIVE *comparison*, while its reference remains an `INDICATIVE_MIDPOINT` and carries that provenance caution. This is distinct from a stale/asynchronous indicative gap.
6. Indicative candidates require STALE/ASYNCHRONOUS, explicit `isIndicativeOnly`, a finite canonical indicative percentage with consistent direction, and no raw live difference. Missing indicative fields are never reconstructed from prices or cached raw differences.
7. Invalid prices, missing provenance/ages/timestamps, nonfinite or sign-inconsistent differences, and unavailable/error provider states cannot become ranked candidates. Error/unavailable prices remain copied into the projection for audit, not presented as valid comparisons.
8. `worthWatching` reuses the existing research-policy threshold: LIVE absolute difference >= 0.05%. It is a monitoring heuristic, not an execution recommendation. Valid flat/subthreshold comparisons may still appear when few candidates exist.
9. Investigation availability means the existing API supports the symbol. It does not promise usable evidence, AI availability, or an explanation. An insufficient-data investigation can still be started; UI request-in-flight disabling remains the caller's job.
10. Surveillance snapshot age is caller-supplied and distinct from provider observation ages. Missing connection metadata stays UNKNOWN; refreshing does not discard valid data. A known connection ERROR hides rankings while retaining the total monitored count.

Examples of deterministic context: `0.84% above reference`, `0.99% below reference`, `Aligned with reference`, `Indicative comparison · reference 3.0h old · 0.99% below reference`. No causation or historical statements are generated.

## Tests and final verification

26 new tests cover live/indicative rankings, overnight group separation, premium/discount/flat/tiny values, the existing threshold, canonical reference-age wording, stale/asynchronous withholding, errors, UNKNOWN and all other modes, session mismatch, shortlist limits, deterministic ties, immutability, no candidates, malformed canonical fields, no recalculation/FX substitution, investigation support, connection state, and integration through merge/selectReference/ageAsset.

Final TypeScript and ESLint passed. All **183 tests passed** (157 existing + 26 new). Production build passed. Component/SSR/hash and scroll-spy scripts passed again.

After restarting the final production build, the dashboard and `/api/market` returned HTTP 200 and branding verification passed again. A real response fetched at **2026-09-20T10:26:11.659Z**, passed through `ageAsset` and then this view model, produced:

- Mode CLOSED, selected group INDICATIVE.
- Total monitored 14; live 0; indicative 14; withheld 0; Worth Watching 0.
- Exactly five displayed assets: MSTR, COIN, INTC, AMD, AAPL, in descending absolute indicative percentage.
- All five preserved reference ages (approximately 37.6–38.4h) and stale/single-exchange/indicative/currency-basis cautions.
- The original Market Opportunities UI remained server-rendered. The new model was invoked only by the verification command, not integrated into the UI.

These are dated verification observations, not runtime fallback values. No live synchronous comparison is claimed during this closed session.

## Existing inconsistencies retained for separate work

- Investigation collection independently implements freshness/session rules, measures against a time captured before requests, and does not guard UNKNOWN consistently with the monitor. This module does not consume investigation evidence.
- The monitor can supply indicative context for UNKNOWN. This module fails safely to WITHHELD without changing that API.
- An aggregate DELAYED Alpaca result can mark fresh individual references delayed. The view model honors canonical withholding; it does not override provider state.
- Browser expiry clears live fields without creating indicative fields. The model withholds rather than inventing a substitute gap.
- Existing UI can describe stale/asynchronous references as “closed” or “Last Close,” and contains hardcoded operational status text. Those assertions must not be carried into the future presentation.
- Optional FX normalization lacks independent fresh-FX gating. This module uses only the canonical raw comparison, retaining currency-basis caution.

No broad fixes were needed to establish this conservative presentation contract. No visual Overview rebuild was started.
