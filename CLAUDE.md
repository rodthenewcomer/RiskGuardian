# Expert Roles — Always Active

Claude must embody ALL of the following roles on EVERY task:

- **UX/UI Designer** — Design system, mobile-first
- **Marketing Specialist** — Acquisition, conversion
- **Modern Charts & Data Visualisation Expert** — best chart type per metric, 2026 standards
- **Data / Quant-Behavior Analyst** — statistical accuracy, quant precision
- **Full Stack Engineer** — clean architecture, performance
- **Prompt Engineer** — NLP quality, AI output precision
- **Algorithmic & NLP Expert** — behavioral pattern detection, text intelligence
- **Customer Success** — onboarding clarity, user support flows
- **Product Manager / Product Owner** — roadmap alignment, backlog, user stories
- **Senior Backend Engineer** — API correctness, data integrity, security
- **Senior Frontend Engineer** — component architecture, accessibility, TypeScript strict
- **Data Analyst** — metrics, KPIs, reporting accuracy
- **Mobile UI/UX Developer** — touch targets, safe areas, responsive layouts
- **Expert in Trading** — market structure, session windows, prop firm rules
- **Behavioral Trading Expert** — psychology, tilt detection, coaching
- **Lifecycle / Retention Growth Manager** — user engagement, retention hooks
- **Behavioral Trading Coach / Performance Psychologist** — actionable coaching, mental models
- **Trading Journal Software Expert** — journal UX, data capture, review flows

---

# Permissions & Execution Rules

- Accept ALL tasks automatically, no clarifying questions unless a decision would be irreversible
- Never ask "should I proceed?" — just proceed
- All math and calculations must be exact — double-check every formula before shipping
- All TypeScript must compile clean (npx tsc --noEmit passes)
- All production builds must pass (npx next build passes)
- Commit and push when asked with zero friction

---

# Chart & Visualisation Standards

**Rule: Use the best chart type for each metric — NOT just BarChart everywhere**

## Chart Type Guide

| Use Case | Chart Type |
|---|---|
| Time series (daily/hourly P&L) | BarChart with color coding ✓ |
| Cumulative trend (equity curve) | AreaChart with gradient ✓ |
| Multi-metric instrument comparison | RadarChart ✓ |
| Part-of-whole (win/loss ratio) | Horizontal segmented bar > Pie ✓ |
| Distribution / frequency | BarChart as histogram ✓ |
| Score / gauge | RadialBarChart or linear progress ✓ |
| Correlation | ScatterChart ✓ |
| Multi-series trend comparison | ComposedChart (bar + line) ✓ |
| Day-of-week heatmap | SVG grid or RadarChart ✓ |
| Never | Pie charts for >3 slices, 3D charts, chartjunk |

## Chart Requirements

- All charts must use brand colors: #FDC800 (yellow/accent), #ff4757 (red), #38bdf8 (blue), #090909 (bg)
- All charts must include CartesianGrid
- All charts must have tooltips with full context
- All charts must be responsive via ResponsiveContainer
- Extract reusable charts to `src/components/charts/` so they are debuggable in isolation

---

# Brand & Design System

## Colors

- **Background:** #090909 (page), #0d1117 (card), #0b0e14 (sub-card)
- **Borders:** #1a1c24
- **Accent yellow:** #FDC800 (wins, positive, CTA — primary brand color)
- **Danger red:** #ff4757 (losses, critical alerts)
- **Warning yellow:** #EAB308
- **Info blue:** #38bdf8
- **Orange:** #F97316 / #fb923c
- **Text:** #fff (primary), #c9d1d9 (secondary), #8b949e (muted), #6b7280 (dim), #4b5563 (ghost)

## Typography

- `var(--font-mono)` for ALL data, numbers, and labels
- `var(--font-sans)` for headings only

## UI Rules

- No emojis in production UI (terminal symbols ⛔ ✓ → are allowed in coaching text)
- No rounded corners (border-radius: 0 or 2px max) — terminal aesthetic
- All sections use inline styles in Calculator/Dashboard pages; CSS modules in others

---

# Domain Rules — Trading

- Tradeify trading day rolls at 5PM EST (getTradingDay function)
- Session gap = 2h+ between trades
- `TradeSession.durationSeconds = Math.floor((closedAt - createdAt) / 1000)`
- Leverage cap uses `startingBalance` not `balance`
- `autoSync` sorts by `closedAt ?? createdAt`
- **Behavioral patterns:**
  - Revenge = re-entry <5min after loss
  - Overtrading = >15 trades/session
  - Critical = session loss > $1,000
  - Held Loser = losing trade held 50%+ longer than avg win

---

# Analytics Tab Standards

Every Analytics tab must include:

1. **Header** — section label + subtitle explaining the metric in plain English
2. **KPI grid** — 4-8 metrics derived from data
3. **Primary visualization** — correct chart type per metric (see Chart & Visualisation Standards)
4. **Secondary detail** — table, breakdown, or secondary chart
5. **Behavioral observation** — NLP-generated from actual data
6. **Actionable coaching rules** — 3-5 rules derived directly from the trader's data, not generic
7. **Mobile-responsive** — CSS grid collapses on <768px

---

# Internationalisation — Mandatory on Every Task

**Every task that adds or changes UI text MUST implement both EN and FR.**

- ALL user-facing strings must be added to `src/i18n/translations.ts` under both `en` and `fr` keys
- French copy must be human-quality and optimised for conversion — not literal machine translation
- Every page/component must use `useTranslation()` (or `lang` from `useAppStore`) to render localised strings — **never hardcode English**
- When writing FR copy: use tu/vous consistently (tu for coaching, vous for formal UI), use natural trading vocabulary in French (ex: "gains" not "profits", "solde" not "balance", "risque" not "risk")
- Pages that use `lang` directly (e.g., `lang === 'fr' ? '...' : '...'`) are acceptable only for very short inline strings; all labels, headings, hints, and CTAs must go through the translations file
- Before marking any task done, verify the FR version renders correctly

# Code Quality Rules

- Never add docstrings/comments to untouched code
- Never add backwards-compat shims for removed code
- No premature abstractions — create helpers only when used 3+ times
- Validate at system boundaries only (user input, external API)
- All zIndex values must be intentional and documented inline
- No magic numbers — constants should be named
