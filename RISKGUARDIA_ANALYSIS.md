# RiskGuardia — Project Analysis & Architecture

**Version:** 5.0 | **Last Updated:** March 5, 2026 18:31 EST | **Status:** ✅ Production Build

---

## 🎯 Core Product Goal

> **"Risk OS for Prop Firm Traders"** — Not just a calculator. A real-time trading brain.

RiskGuardia converts the real questions traders ask during live sessions into instant, intelligent answers:

- *"How many lots?"* → Position Size Engine
- *"Where's my stop?"* → Dynamic SL Calculator
- *"Will I break rules?"* → Prop-Firm Risk Guardian
- *"Am I revenge trading?"* → Behavioral AI Detector
- *"What's my best TP?"* → TP Probability Optimizer

---

## 🏗 Application Architecture

### Navigation (BottomNav — 6 tabs)

| Tab | Icon | Page | Purpose |
|-----|------|------|---------|
| **Home** | LayoutDashboard | DashboardPage | Real-time account health + PnL curve |
| **HUD** | Terminal | CommandPage | Command-line risk terminal |
| **Calc** | Calculator | CalculatorPage | Manual calculator + asset browser |
| **AI** | Brain | **AIChatPage** | Natural language AI Copilot ← NEW |
| **Stats** | BarChart2 | AnalyticsPage | Full 5-tab AI analytics suite |
| **Config** | Settings2 | SettingsPage | Account + prop firm rules |

### File Structure (v5)

```
src/
├── ai/
│   └── RiskAI.ts           ← Core AI engine (10 intelligence functions)
├── app/
│   └── app/page.tsx        ← Route mapping (all 7 tabs wired)
├── components/
│   ├── analytics/
│   │   ├── ConsistencyGauge.tsx
│   │   └── PnLChart.tsx
│   ├── layout/
│   │   ├── BottomNav.tsx   ← Updated: Brain icon for AI tab
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── pages/
│   │   ├── AIChatPage.tsx  ← NEW: Natural language AI copilot
│   │   ├── AnalyticsPage.tsx ← Updated: 5-tab AI analytics
│   │   ├── CalculatorPage.tsx
│   │   ├── CommandPage.tsx ← Updated: AI layer on every trade
│   │   ├── DashboardPage.tsx
│   │   ├── JournalPage.tsx
│   │   ├── Onboarding.tsx
│   │   └── SettingsPage.tsx
│   └── ui/
│       └── DailyGuard.tsx
├── data/
│   └── tradeifyAssets.ts   ← 100+ Tradeify Crypto pairs
└── store/
    └── appStore.ts         ← EST-aware state, Tradeify fee engine
```

---

## 🧠 AI Engine — `src/ai/RiskAI.ts`

10 intelligence functions. Zero external APIs. All <100ms. LLM-ready.

### Use Case Map → Function Map

| Product Use Case | Function | What it solves |
|-----------------|----------|----------------|
| UC1: SL from daily limit | `analyzeRiskGuardian()` | "Where's my stop if daily limit is $50,468?" |
| UC2: SL from dollar risk | `calcSmartPositionSize()` | "Calculate SL for $800 risk on 800 SOL" |
| UC3: TP from balance goal | `calcProfitTarget()` | "I want balance $53,468 — what's my TP?" |
| UC4: Position from risk | `calcSmartPositionSize()` | "How many lots for $800 risk?" |
| UC5: Prop rule protection | `analyzeRiskGuardian()` | "Will this trade break my drawdown?" |
| UC6: Pre-trade approval | `analyzeRiskGuardian()` + `scoreTradeQuality()` | "Is this trade allowed?" |
| UC7: Consistency analysis | `analyzeConsistency()` | "Find my consistency" |
| UC8: Natural language | `AIChatPage.processNaturalLanguage()` | "If I enter BTC at 65,200 and risk $900…" |

### Full Function Reference

| # | Function | Description |
|---|----------|-------------|
| 1 | `analyzeRiskGuardian(account, todayUsed, proposedRisk?)` | Survival analysis: daily/max drawdown, safe risk, trades left, per-trade warning |
| 2 | `calcSmartPositionSize({entry, stop, risk, asset})` | Full position size, TP 2R/3R/custom, notional, commission |
| 3 | `analyzeConsistency(trades)` | 0–100 consistency score, Tradeify 20% payout rule, insights |
| 4 | `analyzeBehavior(trades, maxRisk)` | Revenge trading detector, overtrading, emotional state, cooldown |
| 5 | `scoreTradeQuality({rr, risk, stop, budget, behavior})` | A+/A/B+/B/C/D/F grade with 5-point breakdown |
| 6 | `calcProfitTarget({entry, stop, size, targetBalance})` | Reverse-solve TP from desired balance or profit |
| 7 | `generateJournalInsights(trades, account)` | Auto journal: expectancy, best setup, AI coach message, what-if |
| 8 | `analyzeStrategy(trades)` | Personal rulebook from trade history (best/worst conditions) |
| 9 | `optimizeTakeProfit({entry, stop, risk, winRate})` | 6 TP tiers with probability % and expected value |
| 10 | `generateDailyReport(trades, account, todayUsed)` | End-of-session: discipline grade, strengths, weaknesses, tomorrow focus |

---

## 🖥️ HUD Terminal — CommandPage

### Trade Syntax

```
sol 91.65 90.48        → size from stop (uses default risk%)
sol 91.65 800          → size from contract count
sol 91.65 stop90.48 risk800  → full explicit
sol 91.65 size800 targetbalance53468  → reverse TP from balance goal ← NEW
```

### AI Meta Commands (type directly in terminal)

```
ai        → Risk Guardian + Behavioral status snapshot
coach     → Daily discipline report + grade
strategy  → Personal AI rulebook from trade history
journal   → AI journal: expectancy, best setup, coach message
help      → Full command reference
stats     → P&L + win rate summary
balance X → Update balance
daily X   → Update daily limit
reset     → Reset today's session
clear     → Wipe terminal log
analytics | calc | settings  → Navigate
```

### Automatic AI Layer (every trade output includes)

- **Grade Badge**: A+/A/B+/B/C/D/F with score/100
- **Guardian Badge**: SAFE / CAUTION / DANGER / CRITICAL
- **Emotional State**: DISCIPLINED / CAUTIOUS / STRESSED / REVENGE

---

## 📊 Analytics Page — 5 AI Tabs

| Tab | Content |
|-----|---------|
| **Overview** | Risk Guardian bar, 4 KPIs, Equity Curve, Bar chart, Last Trade Quality Score |
| **Behavior AI** | Emotional state card, consecutive losses, revenge trade meter, overtrading monitor |
| **Consistency** | 0–100 score ring, Tradeify 20% payout rule tracker, AI insights |
| **AI Journal** | AI Coach message, session summary, weekly report, W/L summary |
| **What-If** | 2+ simulation scenarios with actual vs scenario P&L |

---

## 💬 AI Chat Page — AIChatPage

Natural language parser that routes questions to AI functions:

| User asks | System does |
|-----------|-------------|
| "How many lots for BTC at 65200 stop 64900 risk $900?" | Position size engine |
| "Where's my stop for $800 risk on 800 SOL at 91.65?" | SL reverse calculation |
| "What TP to reach $53,468?" | calcProfitTarget() |
| "What's my status?" | analyzeRiskGuardian() + analyzeBehavior() |
| "Coach me" | generateDailyReport() |
| "Am I revenge trading?" | analyzeBehavior() |
| "Best TP probability?" | optimizeTakeProfit() |

### Suggestion Pills (always visible)

- What's my status?
- Coach me on today's session
- Am I showing revenge trading?
- Check if I'm safe to trade
- What's my best TP probability?

---

## 🏦 Tradeify Prop Firm Integration

### Rules Encoded

| Rule | Implementation |
|------|---------------|
| 5x leverage (BTC/ETH Eval) | HUD + Calculator + Guardian |
| 2x leverage (all others) | HUD + Calculator + Guardian |
| 0.04% commission | `calcPositionSize()` in appStore |
| 20s minimum hold | `SettingsPage` Time Guard notice |
| 20% consistency rule | `analyzeConsistency().payoutEligible` |
| Anti-hedging | Settings flag |

### 100+ Asset Registry

Full asset list in `src/data/tradeifyAssets.ts` with leverage per pair.

---

## ⏰ EST Time System

All time-sensitive operations use `America/New_York` timezone:

```typescript
export const getESTDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', ...
}).format(new Date());

export const getESTFull = () => new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York'
});
```

**Used in:** trade timestamps, daily resets, behavior detection, consistency analysis.

---

## 📱 Mobile-First Design

- Tap-to-expand asset browser
- Swipe-friendly tab navigation with spring animation
- Touch-optimized chat input
- Compact KPI cards (2-per-row grid)
- Truncated precision numbers for small screens

---

## 🎨 Design System

- **Primary:** `#A6FF4D` (accent green)
- **Danger:** `#FF4757`
- **Warning:** `#FFB300`
- **Success:** `#34C759`
- **Background:** `#0B0B0F` → `#111115` elevation
- **Font:** Inter (body) + JetBrains Mono (data)
- **Radius:** 4px sm · 8px md · 12px lg · 999px full
- **Motion:** Framer Motion · Spring 400/30 · 220ms ease

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| State | Zustand + persist middleware |
| Styling | CSS Modules (Vanilla) |
| Animation | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |
| AI | Pure algorithmic (LLM-ready architecture) |
| Time | Intl API (America/New_York) |

---

## ✅ Completion Status

| Feature | Status | Notes |
|---------|--------|-------|
| Risk Guardian (UC1, UC5, UC6) | ✅ Done | Both HUD + Analytics |
| Position Size Engine (UC2, UC4) | ✅ Done | HUD + Calculator + AI Chat |
| Profit Target from Balance (UC3) | ✅ Done | `targetbalance` HUD command |
| Behavioral AI (UC7) | ✅ Done | analyzeBehavior() everywhere |
| Natural Language AI (UC8) | ✅ Done | AIChatPage with processNL() |
| Trade Quality Score | ✅ Done | Per-trade badge in HUD |
| Consistency Analyzer | ✅ Done | Tradeify 20% rule tracking |
| TP Optimizer | ✅ Done | 6 probability tiers |
| Strategy Analyzer | ✅ Done | Personal rulebook from history |
| Daily Coach Report | ✅ Done | `coach` HUD command |
| Tradeify Crypto Integration | ✅ Done | All rules + 100+ assets |
| EST Time System | ✅ Done | All timestamps + daily resets |

---

## 🔜 Roadmap (v6)

1. **Chart Vision** — Upload a chart screenshot, AI describes support/resistance, trend, and whether your proposed trade direction conflicts
2. **LLM Integration** — Plug GPT-4o into AIChatPage for free-form coaching
3. **Webhook/API** — REST API for external tools (TradingView alerts, MT5, etc.)
4. **Export** — PDF coaching report generation
5. **Push Notifications** — Daily session open/close reminders (PWA)
6. **Multi-account** — Track multiple prop firm challenges simultaneously

---

## 📋 Build Quality Notes

- `npm run build` → Exit code 0 ✅
- `tsc --noEmit` → Zero errors ✅
- CSS inline styles should be moved to CSS modules (6 known warnings — non-breaking)
- All AI functions are pure functions with no side effects
- All EST date operations use `Intl.DateTimeFormat` with `America/New_York`
