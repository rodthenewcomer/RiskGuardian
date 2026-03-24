# RiskGuardian — System Architecture

---

## Overview

RiskGuardian is a **Next.js 15 App Router** application with client-side persistence via Zustand. All behavioral analysis and AI coaching run locally in the browser — no external AI API calls. Data sync is optional via Supabase and DXTrade.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                        │
│                                                                 │
│  ┌──────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │  Next.js App │  │  Zustand Store     │  │  AI Engine     │  │
│  │  (React UI)  │◄─┤  (localStorage)    │  │  (local NLP)   │  │
│  │              │  │  riskguardia-v2    │  │  < 100ms       │  │
│  └──────┬───────┘  └────────────────────┘  └────────────────┘  │
│         │                                                        │
│  ┌──────▼───────┐  ┌────────────────────┐                       │
│  │  PDF Parser  │  │  Supabase Client   │                       │
│  │  (pdfjs)     │  │  (optional sync)   │                       │
│  └──────────────┘  └────────┬───────────┘                       │
└────────────────────────────┼────────────────────────────────────┘
                             │
                   ┌─────────▼──────────┐
                   │  Next.js API Routes │
                   │  (server-side)      │
                   │  /api/auth/signup   │
                   │  /api/bridge/...    │
                   │  /api/dxtrade/...   │
                   └─────────┬──────────┘
                             │
              ┌──────────────┼──────────────────┐
              │              │                  │
    ┌─────────▼────┐  ┌──────▼──────┐  ┌───────▼──────┐
    │   Supabase   │  │  DXTrade    │  │  Rate Limiter │
    │   (Auth/DB)  │  │  (broker)   │  │  20 req/60s   │
    └──────────────┘  └─────────────┘  └──────────────┘
```

---

## Directory Structure

```
src/
├── app/                    Next.js App Router
│   ├── page.tsx            Landing page (/ route)
│   ├── layout.tsx          Root layout (fonts, providers)
│   ├── app/
│   │   └── page.tsx        Main app shell (/app route)
│   └── api/
│       ├── auth/signup/    POST — Supabase email registration
│       ├── bridge/         POST — DXTrade relay proxy
│       └── dxtrade/        GET  — DXTrade connection handler
│
├── components/
│   ├── pages/              12 full-page components
│   ├── layout/             Header, Sidebar, BottomNav
│   ├── charts/             11 reusable Recharts components
│   ├── ui/                 5 primitive UI components
│   ├── auth/               AuthPage, AuthModal
│   └── ErrorBoundary.tsx
│
├── store/
│   └── appStore.ts         Zustand store (all state + actions)
│
├── ai/
│   ├── RiskAI.ts           Local NLP engine (118 KB)
│   ├── EdgeForensics.ts    Behavioral pattern engine (51 KB)
│   └── SimulationEngine.ts What-if scenario engine (22 KB)
│
├── lib/
│   ├── supabase.ts         Supabase client init
│   ├── supabaseSync.ts     Cloud sync (optional)
│   ├── dxtradeSync.ts      DXTrade trade import
│   ├── parseTradeifyPDF.ts PDF text extraction
│   └── tradeViolations.ts  Rule violation detection
│
├── i18n/
│   └── translations.ts     EN/FR bilingual strings
│
├── hooks/
│   └── useIsMobile.ts
│
└── data/
    └── tradeifyAssets.ts   Curated Tradeify asset list
```

---

## State Management

### Zustand Store (`src/store/appStore.ts`)

Single store, persisted to `localStorage` under key `riskguardia-v2`.

**Key state slices:**

```typescript
interface AppState {
  // Account
  account: AccountSettings;
  trades: TradeSession[];
  dailySessions: DailySession[];
  savedScenarios: SavedScenario[]; // max 3 (FIFO)

  // UI
  activePage: string;
  lang: "en" | "fr";
  mounted: boolean;

  // Actions
  addTrade(trade): void;
  updateTrade(id, patch): void;
  deleteTrade(id): void;
  autoSync(): void; // sorts by closedAt ?? createdAt
  computeDrawdownFloor(): number;
  getTradingDay(date?): string; // rolls at 5PM EST
}
```

**AccountSettings shape:**

```typescript
interface AccountSettings {
  balance: number;
  startingBalance: number; // leverage cap uses this, not balance
  highestBalance: number;
  dailyLossLimit: number;
  maxRiskPercent: number;
  assetType: string;
  currency: string;
  propFirm: string;
  propFirmType: "2-Step Evaluation" | "1-Step Evaluation" | "Instant Funding";
  maxDrawdownLimit: number;
  drawdownType: "EOD" | "Trailing" | "Static";
  leverage: number;
  isConsistencyActive: boolean;
  minHoldTimeSec: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  coolDownMinutes: number;
  payoutLockActive: boolean;
}
```

**TradeSession shape:**

```typescript
interface TradeSession {
  id: string;
  asset: string;
  assetType: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  riskUSD: number;
  rewardUSD: number;
  rr: number;
  outcome: "win" | "loss" | "open";
  pnl: number;
  isShort: boolean;
  createdAt: number; // Unix timestamp ms
  closedAt: number | null;
  durationSeconds: number; // Math.floor((closedAt - createdAt) / 1000)
  tags: string[];
  note: string;
  source: "manual" | "pdf" | "csv" | "dxtrade";
}
```

---

## Routing

| Route                       | Component           | Auth                |
| --------------------------- | ------------------- | ------------------- |
| `/`                         | `LandingPage`       | Public              |
| `/app`                      | Main app shell      | Optional (Supabase) |
| `/app` + `activePage` state | All page components | —                   |

Navigation is **state-based** — the app is a single `/app` route. Page switching changes `activePage` in Zustand, not the URL. This is intentional for PWA and offline-first behavior.

---

## Data Flow

### Trade Entry Flow

```
User inputs trade → CalculatorPage / CommandPage
  → validates via tradeViolations.ts (rule checks)
  → addTrade() in appStore
  → localStorage persistence (Zustand)
  → optional: supabaseSync.ts (cloud backup)
```

### PDF Import Flow

```
User uploads Tradeify PDF
  → parseTradeifyPDF.ts (pdfjs-dist, client-side)
  → text extraction + EST timezone scaling to true UTC
  → deterministic trade ID generated via cyrb53 hash
  → normalized TradeSession[]
  → POST /api/trades/import (server-side Edge Forensics pattern)
  → server safely upserts with ignoreDuplicates: true (preserves notes)
  → client calls fullSync() to pull pristine cloud state
```

### Trading Day Architecture

The `getTradingDay(isoDatetime)` function dynamically assigns trades to a given day based on the active account settings. For `Tradeify Instant Funding` (Crypto), the trading day rolls over at `5:00 PM EST` (17:00). For all other accounts, it rolls at `Midnight EST` (24:00). This dynamically governs Dashboard, Calendar, and Analytics visualizations.

### DXTrade Sync Flow

```
User connects DXTrade account
  → POST /api/dxtrade (server-side proxy, avoids CORS)
  → token stored in Zustand
  → auto-reconnect on token expiry (banner in BridgePage)
  → dxtradeSync.ts normalizes trades → TradeSession[]
  → addTrade() for each new trade
```

### Analytics Data Flow

```
trades (Zustand) → date filter (DateRangePicker)
  → filteredTrades (useMemo)
  → tradesWithDuration (useMemo — ensures durationSeconds)
  → EdgeForensics.generateForensics(trades, account)
  → RiskAI.analyzeRiskGuardian(trades, account)
  → AnalyticsPage renders 11 tabs
```

---

## API Routes

### `POST /api/auth/signup`

Supabase email registration proxy.

**Security:**

- Rate limited: 20 requests / 60 seconds per IP
- CORS headers applied
- Request body size limit: 50 KB

### `POST /api/bridge/[endpoint]`

DXTrade relay proxy. Forwards requests to the DXTrade API server-side to avoid CORS restrictions in the browser.

### `GET /api/dxtrade/...`

DXTrade connection and trade polling handler.

---

## AI Engine Architecture

See [docs/ai-engine.md](ai-engine.md) for full details.

### Summary

```
EdgeForensics.ts (51 KB)
  → generateForensics(trades, account)
  → groups trades into sessions (2h+ gap = new session)
  → tags sessions: CLEAN | REVENGE | OVERTRADING | CRITICAL
  → detects 14 behavioral patterns
  → computes 8-metric scorecard (A–F grades)

RiskAI.ts (118 KB)
  → analyzeRiskGuardian(trades, account)
  → Kelly Criterion, rank scoring, regime detection
  → generateJournalInsights(trades)
  → generateCoachingText(behaviorAnalysis)

SimulationEngine.ts (22 KB)
  → simulateWithRules(trades, config)
  → computes: blocked, modified, savedCapital, delta P&L
  → max 3 saved scenarios (FIFO replacement)
```

All computation runs **locally in the browser, < 100ms**. Zero external API calls.

---

## Authentication

- **Provider:** Supabase (email + Google OAuth)
- **Session storage:** Zustand (persisted to localStorage)
- **Optional:** App works fully offline without auth — sync is additive
- **AuthModal:** Shown on first open if not authenticated

---

## PWA Configuration

- `public/manifest.json` — PWA manifest (complete)
- Service worker: managed by Next.js
- Offline-capable: all core features work without network (state is localStorage)

---

## Performance Notes

- `AnalyticsPage.tsx` is 688 KB — the largest single file. All 11 tabs are in one file to share local state without prop drilling. Heavy computations use `useMemo` with trade arrays as deps.
- `RiskAI.ts` (118 KB) is imported lazily in the AI chat path — not on initial load.
- Lucide React and Framer Motion are tree-shaken via `optimizePackageImports` in `next.config.ts`.
- PDF parsing uses `pdfjs-dist` with a canvas polyfill (`empty-module.ts`) for server-side compatibility.

---

## Build & Quality Gates

```bash
npx tsc --noEmit        # TypeScript must pass clean
npx next build          # Production build must pass
```

Both must pass before any task is considered complete.
