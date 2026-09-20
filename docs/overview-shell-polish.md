# Scoped Overview shell polish

The header and workspace now use the light surface tokens by default, with dark text and green status/action accents. A saved dark/light choice still wins; the same localStorage key and pre-paint initialization preserve persistence. The theme control is a circular, accessible icon button in the header. Desktop search retains its 280px width and toolbar placement; at 768px and below it occupies its own full-width row.

Navigation is an overlay drawer at every width, including desktop. Its navy surface contains WICKLINK / Market Intelligence, canonical surveillance/session/snapshot context, a System Status link, Refresh, and Overview / Markets / Investigations / Methodology. Methodology opens the existing Data Sources experience. Refresh exists only inside the drawer. The backdrop dims and blurs the page; backdrop click, close button, navigation and Escape dismiss it. Opening makes the background inert, locks scrolling and focuses the close button; Tab remains inside the drawer. Closing restores access to the page.

UNKNOWN remains withheld. The current view-model contract does not provide safe UNKNOWN candidates, so no Unverified Watch, inferred session or relaxed comparison rule was introduced. Overview's model, ranking, prices, freshness and investigation callbacks are unchanged.

The mobile Overview-to-Markets boundary now has a 64px section gap and 28px top padding inside Markets, with a subtle divider. Markets and Investigations presentation and business logic were not redesigned.

## Files

- components/ApplicationShell.module.css
- components/Navigation.tsx
- components/MarketMonitor.tsx
- components/ThemeToggle.tsx
- components/theme.ts
- tests/theme.test.ts (intentional light-default expectations)
- scripts/verify-all-mobile-interactions.mjs (six widths; drawer, backdrop, Escape, theme, refresh and existing workflows)
- scripts/verify-viewports.mjs (four primary navigation entries)
- scripts/verify-ui.mjs (Methodology and retained System Status access)
- scripts/verify-brand.mjs (requested uppercase drawer brand and current Overview branding)
- scripts/verify-continuous.mjs (Methodology label)
- docs/overview-viewport-qa/*.png and this report

The earlier Overview replacement report describes the preceding navy-shell version; this scoped polish supersedes only its shell description.

## Verification notes

Typecheck, lint, all 194 tests and production build passed. Viewport layout checks at 375, 390, 430, 768, 1024 and 1440 passed without page/panel overflow. UI contracts, frozen product-logic hashes, branding and continuous navigation/API checks passed. Browser screenshots exposed and helped correct production blur prefix ordering, drawer brand hover contrast and tooltip overflow. Live checks are environment-dependent and use the configured providers and local Edge. UNKNOWN remains covered by deterministic tests rather than invented live data.

Full interaction checks passed at all six widths (phone workflows first, followed by tablet/desktop). Final shell-only phone checks also passed after the tooltip correction. Checks include blur, backdrop and Escape dismissal, no drawer horizontal overflow, at least 48px section separation, theme storage, drawer-only Refresh, search, View all, and exact-symbol investigation completion. No submission-blocking issue was found.

