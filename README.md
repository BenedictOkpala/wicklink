# WickLink

**24/7 Cross-Market Surveillance & Dislocation Intelligence Desk for Tokenized US Equities**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-wicklink.vercel.app-10b981?style=for-the-badge&logo=vercel)](https://wicklink.vercel.app)
[![Next.js 16](https://img.shields.io/badge/Next.js%2016-Turbopack-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React%2019-Strict-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript%205.9-Strict%20Types-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

---

## Overview

> **"Wall Street closed. Price discovery didn't."**

**WickLink** is a cross-market surveillance and dislocation intelligence desk designed to monitor the relationship between traditional US equity markets and 24/7 tokenized assets.

Primary US equity cash auctions (NYSE/Nasdaq) operate on structured market sessions (09:30–16:00 ET) alongside distinct pre-market, after-hours, and overnight extended-hours periods. In contrast, tokenized equities on venues such as **Bitget Reality** trade 24 hours a day, 7 days a week. When traditional exchanges close for the night or weekend, price discovery continues in crypto markets—often producing dislocations, extended-hours pricing gaps, and liquidity spreads relative to primary market references.

WickLink monitors tokenized equity assets against underlying US equity feeds, deterministically resolves market sessions and calendar closures using authoritative timezone rules, enforces sub-minute timestamp synchronization gates, and provides structured multi-hypothesis investigations into market anomalies.

---

## Problem Context

1. **Segmented vs. Continuous Trading Hours**: Crypto-native tokenized equities trade continuously 24/7, whereas underlying US equity cash markets operate during defined market sessions with weekend and holiday closures.
2. **Extended-Hours Pricing Gaps**: Off-hours macro news, earnings announcements, and crypto venue liquidity shocks can move tokenized asset prices while underlying cash markets are closed.
3. **Session-Blind Pricing Traps**: Comparing live 24/7 token quotes against stale closing trades without accounting for active market sessions can produce misleading price comparisons.
4. **Anomaly Explainability**: Understanding whether a dislocation stems from genuine off-hours price discovery, wide bid/ask spreads, timestamp skew, or structural wrapping costs requires systematic evidence collection.

---

## Architecture & How It Works

```
┌────────────────────────────────────────┐     ┌────────────────────────────────────────┐
│          Bitget Reality API            │     │        Alpaca Market Data API          │
│   (Spot Instruments, Snapshots,        │     │      (IEX Real-Time Trades &           │
│    Market States, Calendars)           │     │       Overnight Indicative Quotes)     │
└──────────────────┬─────────────────────┘     └───────────────────┬────────────────────┘
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           │ Concurrent REST Ingestion
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   Deterministic Session Resolver      │
                       │   - IANA America/New_York Engine      │
                       │   - Bitget Schedule & Calendar        │
                       │   - Half-Open Session Intervals       │
                       └───────────────────┬───────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   Feed Selection & Synchronization    │
                       │   - REGULAR: Alpaca IEX Trades        │
                       │   - OVERNIGHT: Indicative Midpoint    │
                       │   - PRE/AFTER/CLOSED: Safe Withhold   │
                       │   - Max 60s Age / Max 30s Skew Gate   │
                       └───────────────────┬───────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   WickLink Intelligence Engine        │
                       │   - Real-time Dislocation Math        │
                       │   - Data Quality Scoring (0-100)      │
                       │   - Deterministic Hypothesis Matrix   │
                       │   - Fast AI Synthesis (with Fallback) │
                       └───────────────────┬───────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │   High-Density Financial Interface    │
                       │   - Market Watch (Ranked Shortlist)   │
                       │   - Reality Overview & Sparklines     │
                       │   - Interactive Investigation Desk    │
                       │   - Light / Dark Frosted Glass Shell  │
                       └───────────────────────────────────────┘
```

---

## Key Features

### 1. Overview & Market Watch
- **Ranked Dislocation Shortlist**: Identifies and ranks top active dislocations by absolute percentage difference during open hours, or indicative extended-hours candidates when cash markets are closed.
- **Contextual Pricing**: Displays tokenized quote vs. reference price, direction status (**PREMIUM** / **DISCOUNT** / **FLAT**), and observation timestamps.
- **One-Click Investigation**: Direct `Investigate` triggers pre-fill and generate detailed asset anomaly reports.

### 2. Reality Market Overview
- **14 Monitored Tokenized Equities**: Real-time surveillance across `AAPL`, `NVDA`, `TSLA`, `MSFT`, `AMZN`, `META`, `GOOGL`, `AMD`, `NFLX`, `COIN`, `PLTR`, `MSTR`, `DIS`, and `INTC`.
- **Integrated Header Search**: Keyboard-accessible (`/`) fuzzy search filtering by symbol and company name.
- **Detailed Provenance Cards**: Expandable panels showing bid/ask quotes, quoting spreads, UTC timestamps, observation ages, and provider status.
- **Trend Sparklines**: Visual price trajectory tracking across monitored intervals.

### 3. Investigation Intelligence Desk
- **Automated Evidence Collection**: Concurrently gathers tokenized snapshots, underlying trades/quotes, session metadata, and quoting spread metrics.
- **Data Quality Score (0–100)**: Transparent scoring evaluating timestamp synchronization, observation age, bid/ask quote symmetry, and session fidelity.
- **Hypothesis Evidence Matrix**: Multi-factor evaluation across standard market dynamics:
  - *Off-Hours Liquidity Gap*: Dislocation during extended hours when underlying equity cash auctions are inactive.
  - *Order Book Imbalance / Spread*: Elevated tokenized bid/ask spread reflecting localized liquidity conditions.
  - *Market Data / Timing Skew*: Discrepancies attributable to timestamp separation or feed latency.
  - *Structural Token Premium/Discount*: Sustained supply/demand variation in tokenized wrappers.
- **"Why This Matters" Summary**: Concise synthesis highlighting key drivers behind the observed pricing.
- **Technical Telemetry**: Expandable diagnostics showing raw payloads, provider latencies, and execution parameters.

### 4. Financial Interface & Navigation
- **Restrained Visual Density**: Compact application shell designed for data clarity and readable typography.
- **Themed Translucent Frosted Drawer**: Responsive navigation drawer with 70% background opacity and 16px backdrop blur, fully styled for Light and Dark modes.
- **Live Surveillance Ticker**: Header strip reflecting live surveillance status, current session phase, and top market movements.

---

## Session Resolution & Freshness Methodology

### Deterministic Session Engine
WickLink utilizes a deterministic session resolver (`lib/market/resolve-session.ts`) operating strictly under authoritative IANA `America/New_York` timezone rules:
- **Session Intervals**: Modeled as half-open ranges `[start, end)`:
  - `REGULAR`: 09:30–16:00 ET (selects Alpaca IEX trades).
  - `AFTER_HOURS`: 16:00–20:00 ET (withholds live comparison unless verified feed exists).
  - `OVERNIGHT`: 20:00–04:00 ET (selects verified Alpaca `feed=overnight` indicative midpoint).
  - `PRE_MARKET`: 04:00–09:30 ET (withholds live comparison).
- **Calendar Closures**: Bitget `regularConfig` (weekends) and `specificConfig` (market holidays) override standard schedule times.
- **DST & Midnight Handling**: Properly resolves overnight sessions crossing local midnight and seasonal Daylight Saving Time transitions without hardcoded UTC offsets.

### Freshness & Synchronization Guardrails
To ensure comparison integrity, WickLink enforces conservative data gates (`lib/market/policy.ts`):
- **Maximum Observation Age**: $\le 60\text{ seconds}$. If either observation exceeds this age, status is marked `STALE` and dislocation calculations are withheld.
- **Maximum Timestamp Skew**: $\le 30\text{ seconds}$ separation between Bitget and Alpaca timestamps. If exceeded, status is marked `ASYNCHRONOUS` and comparison values are set to `null`.
- **Future Timestamp Tolerance**: Rejects timestamps $> 5\text{ seconds}$ ahead of server time.

### Dislocation Formula
```text
priceDifference = tokenizedPrice - referencePrice
absoluteDifference = |priceDifference|
rawDislocationPercent = (priceDifference / referencePrice) * 100
```
- Floating-point differences within $4 \times \varepsilon$ are evaluated as `FLAT` ($0.00\%$).
- Positive differences are classified as `PREMIUM` (tokenized price above reference).
- Negative differences are classified as `DISCOUNT` (tokenized price below reference).

---

## Investigation & AI Synthesis Workflow

WickLink implements a **hybrid deterministic + AI architecture**:

1. **Deterministic Baseline**: The server gathers live market data, computes mathematical signals, evaluates hypothesis criteria, and scores data quality. All core reporting functions without requiring external AI services.
2. **Optional LLM Synthesis**: When configured (`AI_API_KEY`), the engine passes the structured evidence matrix to an OpenAI-compatible endpoint (`gpt-4o-mini` by default) with an 8-second timeout.
3. **Structured Schema Validation**: The AI synthesizes qualitative research context, refines confidence rationales, and highlights missing evidence within strict JSON schemas.
4. **Deterministic Fallback**: If the AI request times out, fails, or is unconfigured, WickLink returns the complete verified deterministic report with zero interruption.

---

## API Integrations

| Provider | Endpoints Used | Authentication | Data Ingested |
| :--- | :--- | :--- | :--- |
| **Bitget Reality** | `GET /api/v3/market/instruments?category=SPOT`<br>`GET /api/v3/market/tickers?category=SPOT&symbol={symbol}`<br>`GET /api/v3/reality/market/states`<br>`GET /api/v3/reality/market/calendar` | None (Public REST) | Reality tokenized US equity spot pairs (`RAAPLUSDT`, etc.), last prices, snapshot timestamps, market schedules, holiday calendars. |
| **Alpaca Market Data** | `GET /v2/stocks/trades/latest?symbols=...&feed=iex`<br>`GET /v2/stocks/quotes/latest?symbols=...&feed=overnight` | Server-side Headers:<br>`APCA-API-KEY-ID`<br>`APCA-API-SECRET-KEY` | Multi-symbol real-time IEX US equity trades (Regular session) & extended-hours overnight quotes (bid/ask/midpoint). |
| **AI Engine** *(Optional)* | `POST /v1/chat/completions` (OpenAI-compatible) | Server-side Bearer Token:<br>`AI_API_KEY` | Structured synthesis, qualitative market context, and anomaly explanation. |

---

## Technical Stack & File Layout

```
WickLink / NightShift
├── app/
│   ├── api/
│   │   ├── market/route.ts       # Aggregated multi-provider market feed
│   │   ├── investigate/route.ts  # Deep investigation analysis API
│   │   └── sparklines/route.ts   # Asset sparkline trend endpoints
│   ├── globals.css               # Core design tokens, themes & layout grid
│   ├── layout.tsx                # App root with theme script injection
│   └── page.tsx                  # Server-rendered dashboard entry point
├── components/
│   ├── ApplicationShell.module.css # Drawer, header chrome & layout styling
│   ├── OverviewView.tsx          # Market Watch & ranked dislocation module
│   ├── MarketMonitor.tsx         # Primary dashboard controller & state manager
│   ├── ResearchViews.tsx         # Investigation report, methodology & system views
│   ├── AssetDetail.tsx           # Expanded asset drawer & provenance inspection
│   ├── Navigation.tsx            # Translucent frosted-glass navigation drawer
│   └── ThemeToggle.tsx           # Instant light/dark theme switch
├── lib/
│   ├── ai/                       # AI synthesis client, prompts & schema validation
│   ├── alpaca/                   # Authenticated Alpaca trade & quote normalizers
│   ├── bitget/                   # Bitget instruments, tickers & calendar transport
│   ├── dislocation/              # Pure arithmetic dislocation calculator
│   ├── investigation/            # Deterministic signals, quality score & hypotheses
│   ├── market/                   # Session resolver, merge logic & freshness gate
│   └── overview/                 # Shortlist ranking & overview view model
└── tests/                        # 194 unit, integration & session regression tests
```

### Technology Highlights
- **Next.js 16 (Turbopack)**: App Router with server-side rendered initial state and fast client transitions.
- **React 19**: Modern concurrent components with server-only secret isolation.
- **TypeScript 5.9 (Strict)**: Full type safety across provider payloads, normalized schemas, and UI view models.
- **Node.js Native Test Runner**: Lightweight test execution (`node --test`).
- **Tailwind CSS v4 & CSS Modules**: Fine-grained responsive styling, design tokens, and backdrop blur.

---

## Local Setup & Development

### Prerequisites
- **Node.js**: `v22.18.0` or higher (tested on Node `24.x`).
- **npm**: `v10.x` or higher.

### 1. Clone & Install
```bash
git clone https://github.com/BenedictOkpala/wicklink.git
cd wicklink
npm ci
```

### 2. Configure Environment Variables
Create a `.env.local` file from the template:
```bash
cp .env.example .env.local
```

Configure your credentials:
```env
# Server-side ticker freshness threshold in milliseconds (default: 60000)
MARKET_STALE_AFTER_MS=60000

# Alpaca Market Data Credentials (Server-Side Only)
# Free keys available at https://alpaca.markets
APCA_API_KEY_ID=your_alpaca_key_id
APCA_API_SECRET_KEY=your_alpaca_secret_key

# Optional AI Research Synthesis (OpenAI-compatible)
AI_API_KEY=your_openai_or_compatible_key
AI_ENDPOINT=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```
*(Note: If Alpaca keys or AI keys are omitted, WickLink operates in degraded/deterministic mode without crashing).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run Quality Verification Suite
```bash
# Typecheck
npm run typecheck

# Lint
npm run lint

# Run all 194 unit & integration tests
npm test

# Production Build
npm run build
```

---

## Environment Variables Reference

| Variable | Required? | Default | Purpose |
| :--- | :---: | :---: | :--- |
| `APCA_API_KEY_ID` | Optional | `""` | Alpaca API Key for underlying US equity trade/quote data. |
| `APCA_API_SECRET_KEY` | Optional | `""` | Alpaca Secret Key for underlying US equity market data. |
| `MARKET_STALE_AFTER_MS` | Optional | `60000` | Freshness threshold for server-side quote evaluation (in ms). |
| `AI_API_KEY` | Optional | `""` | API key for LLM research synthesis (OpenAI, Groq, etc.). |
| `AI_ENDPOINT` | Optional | `https://api.openai.com/v1` | Base URL for OpenAI-compatible chat completions endpoint. |
| `AI_MODEL` | Optional | `gpt-4o-mini` | LLM model identifier for investigation summaries. |

---

## Disclosures & Known Limitations

- **Read-Only Intelligence**: WickLink is an observational market intelligence tool. It does not execute trades, manage private keys, connect crypto wallets, or route orders.
- **Raw Numerical Comparisons**: Dislocation percentages represent raw numeric differences between tokenized quotes (USDT) and underlying stock prices (USD). WickLink does not perform FX conversions, corporate action adjustments, or dividend entitlement scaling.
- **IEX Market Data Coverage**: Alpaca market data uses the IEX exchange feed by default; pricing may vary from full consolidated SIP tape feeds.
- **Extended-Hours Liquidity**: Tokenized equity markets outside regular US exchange hours typically experience lower liquidity and wider spreads. WickLink explicitly surfaces these factors in its Investigation reports.

---

## Deployment & Repository Links

- **Live Application**: [https://wicklink.vercel.app](https://wicklink.vercel.app)
- **GitHub Repository**: [https://github.com/BenedictOkpala/wicklink](https://github.com/BenedictOkpala/wicklink)
- **Documentation & Verification**: Located in the repository `/docs` and `/scripts` directories.

---

*Built for the Hackathon.*
