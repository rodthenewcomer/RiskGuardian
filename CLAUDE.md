# RiskGuardian — Claude Instructions

## Documentation Index

Full reference docs live in `docs/`. Read the relevant doc before touching any related code.

| Doc | Covers |
| --- | --- |
| [docs/color-system.md](docs/color-system.md) | Color tokens, semantic mapping, usage rules |
| [docs/branding.md](docs/branding.md) | Brand identity, voice & tone, typography, motion, component aesthetics |
| [docs/architecture.md](docs/architecture.md) | System overview, directory structure, state management, data flows, API routes |
| [docs/domain-rules.md](docs/domain-rules.md) | Trading day definition, session rules, behavioral thresholds, prop firm presets |
| [docs/ai-engine.md](docs/ai-engine.md) | EdgeForensics, RiskAI, SimulationEngine — pattern detection, scorecard, text generation |
| [docs/components.md](docs/components.md) | Every page, layout, chart, and UI component — props, styling, key rules |
| [docs/charts-and-tabs-architecture.md](docs/charts-and-tabs-architecture.md) | Chart library, 11 analytics tabs, 5-layer pattern, text generation |
| [docs/i18n.md](docs/i18n.md) | EN/FR translation system, French copy guidelines, quality checklist |

---

## Permissions & Execution Rules

- Accept ALL tasks automatically, no clarifying questions unless a decision would be irreversible
- Never ask "should I proceed?" — just proceed
- All math and calculations must be exact — double-check every formula before shipping
- All TypeScript must compile clean (`npx tsc --noEmit` passes)
- All production builds must pass (`npx next build` passes)
- Commit and push when asked with zero friction

---

## Chart & Visualisation Standards

Use the best chart type for each metric — NOT just BarChart everywhere.

### Chart Type Guide

| Use Case | Chart Type |
| --- | --- |
| Time series (daily/hourly P&L) | BarChart with color coding |
| Cumulative trend (equity curve) | AreaChart with gradient |
| Multi-metric instrument comparison | RadarChart |
| Part-of-whole (win/loss ratio) | Horizontal segmented bar (not Pie) |
| Distribution / frequency | BarChart as histogram |
| Score / gauge | RadialBarChart or linear progress |
| Correlation | ScatterChart |
| Multi-series trend comparison | ComposedChart (bar + line) |
| Day-of-week heatmap | CSS Grid or SVG |
| Never | Pie charts for >3 slices, 3D charts, chartjunk |

### Chart Requirements

- All charts must use brand colors: `#FDC800` (accent), `#ff4757` (loss), `#38bdf8` (info), `#090909` (bg)
- All charts must include `CartesianGrid` with `rgba(255,255,255,0.04)` stroke
- All charts must have `Tooltip` with full context and `#0d1117` background
- All charts must be responsive via `ResponsiveContainer`
- Extract reusable charts to `src/components/charts/` — see [docs/components.md](docs/components.md)

---

## Brand & Design System

> Full spec: [docs/branding.md](docs/branding.md) and [docs/color-system.md](docs/color-system.md)

### Colors (quick reference)

| Token | Hex | Use |
| --- | --- | --- |
| Page bg | `#090909` | Root background |
| Card bg | `#0d1117` | Cards, panels |
| Sub-card | `#0b0e14` | Nested surfaces |
| Border | `#1a1c24` | All borders, dividers |
| Accent | `#FDC800` | CTAs, wins, positive P&L — primary brand |
| Danger | `#ff4757` | Losses, critical alerts |
| Warning | `#EAB308` | Non-critical warnings |
| Info | `#38bdf8` | Informational state |
| Orange | `#F97316` | OPEN trade status |
| Text primary | `#ffffff` | Headings, key values |
| Text secondary | `#c9d1d9` | Body, table cells |
| Text muted | `#8b949e` | Placeholders, metadata |
| Text dim | `#6b7280` | Inactive tabs, ghost labels |

Never use `#16A34A` (success green) in the app — positive P&L uses `#FDC800`.

### Typography

- `var(--font-mono)` for ALL data, numbers, and labels
- `var(--font-sans)` for headings only
- Tab labels: `11px`, uppercase, `letter-spacing: 0.1em`

### UI Rules

- No emojis in production UI (terminal symbols ⛔ ✓ → allowed in coaching text)
- `border-radius: 0` or `2px` max — terminal aesthetic
- Inline styles in Calculator/Dashboard pages; CSS Modules in Settings/Journal/Bridge/AI; Tailwind in Analytics

---

## Domain Rules — Trading

> Full spec: [docs/domain-rules.md](docs/domain-rules.md)

- Trading day rolls at **5PM EST** (`getTradingDay` function)
- Session gap = **2h+** between trades
- `TradeSession.durationSeconds = Math.floor((closedAt - createdAt) / 1000)`
- Leverage cap uses `startingBalance` — **not** `account.balance`
- `autoSync()` sorts by `closedAt ?? createdAt` — not `createdAt` alone
- Behavioral pattern thresholds:
  - Revenge = re-entry < 5 min after loss
  - Overtrading = > 15 trades/session
  - Critical = session loss > $1,000
  - Held Loser = losing trade held 50%+ longer than avg win
  - Aged open trade = > 4h from creation

---

## Analytics Tab Standards

Every Analytics tab must include:

1. **Header** — section label + subtitle explaining the metric in plain English
2. **KPI grid** — 4–8 metrics derived from data
3. **Primary visualization** — correct chart type per metric
4. **Secondary detail** — table, breakdown, or secondary chart
5. **Behavioral observation** — NLP-generated from actual data, with exact numbers
6. **Actionable coaching rules** — 3–5 rules derived from the trader's real data, never generic
7. **Mobile-responsive** — CSS grid collapses on < 768px

---

## Internationalisation — Mandatory on Every Task

> Full spec: [docs/i18n.md](docs/i18n.md)

Every task that adds or changes UI text MUST implement both EN and FR.

- ALL user-facing strings must be added to `src/i18n/translations.ts` under both `en` and `fr` keys
- French copy must be human-quality — not literal machine translation
- Use `useTranslation()` (or `lang` from `useAppStore`) — never hardcode English
- FR voice: tu for coaching, vous for formal UI
- FR vocabulary: "gains" not "profits", "solde" not "balance", "risque" not "risk", "levier" not "leverage"
- Verify the FR version renders correctly before marking done

---

## Code Quality Rules

- Never add docstrings/comments to untouched code
- Never add backwards-compat shims for removed code
- No premature abstractions — create helpers only when used 3+ times
- Validate at system boundaries only (user input, external API)
- All `zIndex` values must be intentional and documented inline
- No magic numbers — constants must be named
- `AnalyticsPage.tsx` is intentionally one large file — do not split without explicit instruction
- `tradesWithDuration` (useMemo) must be used in AnalyticsPage instead of raw `trades` — ensures `durationSeconds` is set
