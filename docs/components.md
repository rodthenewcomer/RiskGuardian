# RiskGuardian — Component Reference

---

## Page Components (`src/components/pages/`)

### DashboardPage

**File:** `DashboardPage.tsx` (72 KB)
**Styling:** Inline styles

Main home view. Shows today's P&L, KPI cards, open trades list, equity mini-chart, alerts.

**Key features:**
- Empty state guard (`!mounted` check before rendering)
- Aged open trade warning (>4h, clickable → Journal)
- Weekend gap risk alert (Fri PM + open positions)
- Daily Guard status (green/locked)

---

### JournalPage

**File:** `JournalPage.tsx` (114 KB)
**Styling:** CSS Module + inline

Full trade journal with:
- Calendar heatmap (monthly view, animated month transitions with `calendarDir` state + AnimatePresence)
- Trade list with filters (outcome, date, asset, tags)
- Inline WIN/LOSS buttons on open trades (`inlineOutcomeId` state → row-level controls)
- Empty state CTA ("Log a Trade" button)

---

### AnalyticsPage

**File:** `AnalyticsPage.tsx` (688 KB — largest file)
**Styling:** Tailwind
**Wrapped by:** `ErrorBoundary.tsx`

11-tab behavioral analytics dashboard. See [charts-and-tabs-architecture.md](charts-and-tabs-architecture.md) for full details.

**Tabs:** OVERVIEW · DAILY P&L · INSTRUMENTS · SESSIONS · TIME OF DAY · STREAKS · PATTERNS (N) · SCORECARD · QUANT · VERDICT · COMPARE

**Performance:** All heavy computations use `useMemo` with `filteredTrades` as the dependency. Date filter is a custom `DateRangePicker` in a `.dateFilterRow` bar above the tab rail.

---

### CalculatorPage

**File:** No `.tsx` (only `CalculatorPage.module.css`)
**Styling:** CSS Module + inline

Position size calculator. Given entry, stop loss, and account risk% → computes exact lot size.

**Key rules:**
- Dropdown max-height: 200px on mobile
- Numeric inputs: `pattern="[0-9]*"` for iOS numeric keyboard
- Leverage cap uses `startingBalance`, not `account.balance`
- `useEffect` dependency comment is intentional (documented in code)

---

### CommandPage

**File:** `CommandPage.tsx` (54 KB)
**Styling:** CSS Module

CLI-style trade entry. User types commands like `NQ 21450 21400 500` → parsed into trade params.

---

### AIChatPage

**File:** `AIChatPage.tsx` (22 KB)
**Styling:** CSS Module

Chat interface to the local `RiskAI.ts` engine. Surfaces coaching, pattern observations, and what-if analysis.

**Key rule:** When `account.payoutLockActive === true` OR daily limit is blown, refuses to compute trade risk calculations and shows a locked message.

---

### BridgePage

**File:** `BridgePage.tsx` (33 KB)
**Styling:** CSS Module

DXTrade/broker integration UI. Shows connection status and auto-reconnect banner when token has expired.

---

### SettingsPage

**File:** `SettingsPage.tsx` (63 KB)
**Styling:** CSS Module

Account configuration: balance, prop firm preset selection, drawdown type, consistency rules, behavioral guard thresholds.

---

### SimulatorPage

**File:** `SimulatorPage.tsx` (74 KB)
**Styling:** Inline

What-if scenario testing. Runs `SimulationEngine.simulateWithRules()` with modified account rules. Saves up to 3 scenarios (FIFO).

---

### Onboarding

**File:** `Onboarding.tsx` (22 KB)
**Styling:** CSS Module

Initial setup wizard. Covers: account balance, prop firm selection, risk preferences.

**Key UI:** Skip DXTrade button is prominently styled as secondary button with label "(works with any prop firm)".

---

### LandingPage

**File:** `LandingPage.tsx` (31 KB)
**Styling:** CSS Module

Public marketing page at `/`. Uses a separate light-mode design language — see [branding.md](branding.md).

---

### TradePlanPage

**File:** `TradePlanPage.tsx` (5.7 KB)
**Styling:** Inline

HUD showing entry/SL/TP visuals for a locked trade plan.

---

## Layout Components (`src/components/layout/`)

### BottomNav

**File:** `BottomNav.tsx` + `BottomNav.module.css`

Mobile-first bottom navigation. Visible on `< 640px`. Hidden on desktop.

**Key:** `padding-bottom: env(safe-area-inset-bottom)` — required for iPhone home bar.

---

### Header

**File:** `Header.tsx` + `Header.module.css`

Top bar showing account balance and notification bell. Shown on mobile.

---

### Sidebar

**File:** `Sidebar.tsx` + `Sidebar.module.css`

Desktop navigation panel. Visible on `> 1024px`. Shows all pages, active state with `#FDC800` left border.

---

## Chart Components (`src/components/charts/`)

All charts use Recharts. All are responsive via `ResponsiveContainer`. See [charts-and-tabs-architecture.md](charts-and-tabs-architecture.md) for detailed specs.

| Component | Recharts Type | Key Use |
|---|---|---|
| `EquityCurveChart` | AreaChart | Cumulative P&L, adaptive gradient |
| `ComposedDailyChart` | ComposedChart | Daily P&L bars + rolling avg line |
| `PnLHistogram` | BarChart | Trade P&L distribution histogram |
| `DayOfWeekChart` | BarChart (horizontal) | P&L or win rate by weekday |
| `InstrumentRadar` | RadarChart | Multi-metric instrument comparison |
| `HeatmapGrid` | CSS Grid (no Recharts) | Hour × Day-of-week heatmap |
| `TradeScatterChart` | ScatterChart | Trade scatter (entry time vs P&L) |
| `DrawdownCurve` | AreaChart | Drawdown depth over time |
| `MonthlyCalendarHeatmap` | Custom | Calendar grid with P&L intensity |
| `StreakBeads` | Custom SVG | Win/loss streak visualization |
| `RiskGuardianPrimitives` | Custom SVG | Shared SVG shapes |

**Legacy chart (do not use for new features):**

| Component | Location | Notes |
|---|---|---|
| `PnLChart` | `src/components/analytics/` | Simple AreaChart, used in DashboardPage mini-chart only |
| `ConsistencyGauge` | `src/components/analytics/` | Legacy gauge |

---

## UI Primitives (`src/components/ui/`)

### DateRangePicker

Custom date range picker (not a library component).

**Features:**
- Scrollable months (no calendar library)
- Range highlight between start/end dates
- Trade dots on dates that have trades
- Mobile-first layout

Used in: AnalyticsPage date filter bar.

---

### DailyGuard

Visual display of the daily guard status (P&L remaining vs limit).

---

### Toast

Notification system. Shows transient messages for sync success, import errors, etc.

---

### Logo

Brand mark component. Renders the RiskGuardian logo in `#FDC800`.

---

### OutcomeCard

Displays a trade outcome (WIN/LOSS/OPEN) with colored badge and P&L.

---

## Auth Components (`src/components/auth/`)

### AuthPage

Full-page authentication form (email + password).

### AuthModal

Overlay modal version of the auth form, shown when a sync action requires authentication.

---

## ErrorBoundary (`src/components/ErrorBoundary.tsx`)

Wraps `AnalyticsPage` to catch render errors from the heavy computation path. Shows a fallback UI instead of crashing the entire app.

---

## Component Conventions

### Styling approach by file

| Component type | Styling |
|---|---|
| CalculatorPage, DashboardPage | Inline styles only |
| Settings, Journal, Bridge, AI, Analytics | CSS Modules |
| Analytics tab content | Tailwind |

### TypeScript

- All components are typed with explicit `interface Props` (no implicit `any`)
- `strict: true` in tsconfig — no non-null assertions without justification
- All event handlers typed with React event types

### Internationalisation

- All user-facing strings via `useTranslation()` or `lang` from `useAppStore`
- Never hardcode English strings in JSX
- New strings must be added to `src/i18n/translations.ts` under both `en` and `fr`
