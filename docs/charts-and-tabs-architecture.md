# RiskGuardian — Charts & Tab Architecture

---

## 1. Chart Library

All charts use **Recharts** (React-native, SVG-based, responsive).
`HeatmapGrid` is the only exception — it is built with pure **CSS Grid** (no chart lib) for full-width responsiveness.

Some Recharts primitives (PieChart, BarChart, AreaChart, ScatterChart) are also imported
**directly inside `AnalyticsPage.tsx`** for one-off inline charts not yet extracted to
`src/components/charts/`.

---

## 2. Reusable Chart Components — `src/components/charts/`

### `EquityCurveChart.tsx`
| | |
|---|---|
| **Recharts type** | `AreaChart` + gradient fill |
| **What it shows** | Cumulative P&L over the sequence of trades — the equity curve |
| **Color logic** | Green gradient if final P&L ≥ 0, red gradient if negative |
| **Key props** | `data: { i, pnl, date }[]`, `height`, `showGrid`, `showAxis`, `gradientId` |
| **Used in** | `AnalyticsPage` — QUANT tab (equity curve section) |

---

### `ComposedDailyChart.tsx`
| | |
|---|---|
| **Recharts type** | `ComposedChart` (Bar + Line overlay) |
| **What it shows** | Daily P&L bars (green = profit, red = loss) + dashed yellow rolling N-day average line |
| **Why this type** | Bar height = magnitude, bar color = direction, line = trend context. A plain BarChart hides the trend — the line overlay answers "am I improving?" |
| **Exports** | `addRollingAvg(data, window)` — utility to inject `rollingAvg` field before rendering |
| **Key props** | `data: DailyPoint[]`, `height`, `rollingWindow` (default 5) |
| **Used in** | `AnalyticsPage` — OVERVIEW / DAILY P&L tab |

---

### `PnLHistogram.tsx`
| | |
|---|---|
| **Recharts type** | `BarChart` as frequency histogram |
| **What it shows** | Distribution of individual trade P&L values, bucketed into N bins |
| **Color logic** | Green bins = profit zone, red bins = loss zone. Opacity scales with frequency (more trades = more opaque) |
| **Internal logic** | `buildHistogram(values, buckets)` — computes bucket midpoints, counts per bin |
| **Key props** | `pnlValues: number[]`, `buckets` (default 20), `height` |
| **Used in** | `AnalyticsPage` — OVERVIEW tab (distribution section) |

---

### `DayOfWeekChart.tsx`
| | |
|---|---|
| **Recharts type** | Horizontal `BarChart` (diverging from zero) |
| **What it shows** | P&L or win rate per weekday (Mon → Fri) |
| **Why horizontal** | 5 categories with large numeric labels read better as horizontal bars than vertical. RadarChart was considered but rejected. |
| **Metric toggle** | `metric='pnl'` diverges from $0 · `metric='wr'` shows 0–100% with a 50% reference line |
| **Key props** | `data: DayStats[]`, `height`, `metric` |
| **Used in** | `AnalyticsPage` — TIME OF DAY tab (day-of-week breakdown) |

---

### `InstrumentRadar.tsx`
| | |
|---|---|
| **Recharts type** | `RadarChart` (spider/web) |
| **What it shows** | Multi-dimensional comparison of up to 5 instruments across: Win Rate, Profit Factor, Expectancy, W/L Ratio, Volume |
| **Normalization** | All axes normalized 0–100 via `normalize(val, min, max)` so different-scale metrics are directly comparable on one chart |
| **Why radar** | A bar chart answers one dimension at a time. A radar answers all 5 simultaneously — "which instrument is strongest overall?" |
| **Key props** | `instruments: InstrumentMetric[]`, `highlight`, `height` |
| **Used in** | `AnalyticsPage` — INSTRUMENTS tab |

---

### `HeatmapGrid.tsx`
| | |
|---|---|
| **Implementation** | Pure CSS Grid — no Recharts |
| **What it shows** | Hour × Day-of-Week P&L intensity heatmap. Each cell = average P&L for that (day, hour) slot |
| **Color logic** | Green = profit, red = loss. Intensity = `0.18 + (abs(pnl)/maxAbs) * 0.72` alpha scaling |
| **Why CSS Grid** | Fills 100% width, each column is `1fr`, fully responsive without ResponsiveContainer overhead |
| **Tooltip** | Native HTML `title` attribute — no Recharts tooltip |
| **Key props** | `data: CellData[]`, `minTrades` (filter cells with too few trades) |
| **Used in** | `AnalyticsPage` — TIME OF DAY tab (session heatmap) |

---

### `TradeScatterChart.tsx`
| | |
|---|---|
| **Recharts type** | `ScatterChart` with `ZAxis` for bubble sizing |
| **What it shows** | Individual trades as dots. X = entry hour or hold duration, Y = P&L. Dot size = abs(P&L) |
| **Two datasets** | `wins` rendered green · `losses` rendered red — two separate `<Scatter>` components on the same chart |
| **Why scatter** | Reveals time/duration sweet spots through visual clustering — impossible to see in a bar chart or table |
| **Key props** | `data: ScatterPoint[]`, `xLabel`, `height`, `xFormatter` |
| **Used in** | `AnalyticsPage` — TIME OF DAY tab (trade scatter) |

---

### `PnLChart.tsx` — Legacy (`src/components/analytics/`)
| | |
|---|---|
| **Recharts type** | `AreaChart` (static green gradient, no color-flip) |
| **What it shows** | Simple cumulative equity curve — always green, no adaptive color logic |
| **Difference vs EquityCurveChart** | Older component, simpler tooltip, uses Tailwind classes in tooltip markup, no `gradientId` prop |
| **Used in** | `DashboardPage` — mini equity chart in the summary card |

---

## 3. Analytics Tab Layout

### Visual structure (top to bottom)

```
┌─────────────────────────────────────────────────────┐
│  Date range filter bar                              │  ← .dateFilterRow
│  [ From ] [ To ] [ Clear ] ... [ N trades shown ]  │
├─────────────────────────────────────────────────────┤
│  Tab bar (horizontally scrollable)                  │  ← .topTabsWrapper
│  OVERVIEW · DAILY P&L · INSTRUMENTS · SESSIONS ... │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Tab content (animated fade/slide)                  │  ← .content
│                                                     │
└─────────────────────────────────────────────────────┘
```

### The 11 tabs (in order)

```
OVERVIEW · DAILY P&L · INSTRUMENTS · SESSIONS · TIME OF DAY
· STREAKS · PATTERNS (N) · SCORECARD · QUANT · VERDICT · COMPARE
```

`PATTERNS (N)` is dynamic — the count updates with the number of behavioral patterns detected
from the trader's actual data.

### Tab bar mechanics

- CSS class `.topTabsWrapper` — `overflow-x: auto`, `scroll-behavior: smooth`, no visible scrollbar
- Inner `.topTabs` — `display: flex`, `gap: 32px`, `padding: 0 32px`
- Each tab is a `<button>` with `scroll-snap-align: start` — snaps cleanly on mobile swipe
- On click: `scrollIntoView({ behavior: 'smooth', inline: 'center' })` — auto-centers the active tab
- Active state: `border-bottom: 2px solid #A6FF4D` + white text
- Inactive: `color: #6b7280`, uppercase, `11px`, `letter-spacing: 0.1em`

### Tab key matching

Tab labels are matched by taking `t.split(' ')[0]` — so:
- `"DAILY P&L"` → key is `"DAILY"`
- `"TIME OF DAY"` → key is `"TIME"`
- `"PATTERNS (3)"` → key is `"PATTERNS"` (matched with `activeTab.startsWith('PATTERNS')`)

### Content switching

```tsx
<AnimatePresence mode="wait">
  {activeTab === 'OVERVIEW' && (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      ...
    </motion.div>
  )}
</AnimatePresence>
```

- `AnimatePresence mode="wait"` — waits for the exit animation to finish before mounting the next tab
- Each panel enters from `y: +10` and exits to `y: -10` — a subtle upward scroll feel
- QUANT and VERDICT tabs use IIFE pattern (`{activeTab === 'QUANT' && (() => { ... })()}`) because
  they require heavy local variable computation before rendering

---

## 4. Explanations & Actions System

Every analytics section follows a 5-layer pattern:

```
1. Header      — section label + plain-English subtitle
2. KPI grid    — 4–8 computed metrics
3. Chart       — best chart type for the metric
4. Behavioral Observation — NLP string derived from actual data
5. Coaching Action — 1–3 directives derived from the trader's numbers
```

### Layer 4 — Behavioral Observation

**Where generated:**
- `EdgeForensics.ts` — `generateForensics()` computes session tags (`CLEAN`, `REVENGE`, `OVERTRADING`,
  `CRITICAL`) and 14 behavioral patterns (Revenge Trading, Held Losers, Early Exit, Spike Vulnerability,
  Micro Overtrading, etc.)
- `AnalyticsPage.tsx` — inline conditional strings built at render time from computed metrics

**How it works (EdgeForensics):**
```
generateForensics(trades, account)
  → groups trades into sessions (gap > 2h = new session)
  → tags each session: REVENGE if re-entry < 5min after loss
  → detects 14 patterns with frequency, impact ($), severity, and evidence array
  → produces scorecard: 8 graded metrics (A/B/C/D/F) with thresholds
```

**Observation strings are data-driven — not generic:**
```
REVENGE session:
  "Rapid re-entry detected after a loss. Emotional execution cost
   $140 in avoidable exposure per trade."

CRITICAL session:
  "Session P&L hit critical loss threshold (-$1,240). Decision quality
   degraded toward end of session. 4 consecutive losses indicate
   tilt mode was active."
```

### Layer 5 — Coaching Action

**Same source as observations — computed from the trader's own numbers:**

```
REVENGE tag → "After any losing trade, mandatory 5-min break before next entry.
               Re-entry within 2min of a loss is statistically proven to be a
               losing behavior in your data."

CRITICAL tag → "Implement a session hard-stop at -$620 (50% of this session's
                damage). The data shows continued trading after a critical
                threshold deepens the loss every time."

Best instrument → "NQ is your strongest instrument across all metrics
                   (62% WR, 2.14 PF). Allocate your highest conviction
                   sizing here."
```

**The dollar amounts, percentages, and counts embedded in coaching strings are computed
live from `closed` trades — they are never hardcoded or generic.**

### Where each layer lives in the file

| Layer | Source | File |
|---|---|---|
| Session tags (REVENGE, CRITICAL…) | `createSessionGroup()` | `EdgeForensics.ts` |
| 14 behavioral patterns | `generateForensics()` | `EdgeForensics.ts` |
| Scorecard grades (A–F) | `generateForensics()` | `EdgeForensics.ts` |
| Inline observations | Conditional JSX strings | `AnalyticsPage.tsx` |
| Inline coaching actions | Conditional JSX strings | `AnalyticsPage.tsx` |
| Risk Guardian text | `analyzeRiskGuardian()` | `RiskAI.ts` |
| Kelly note | `analyzeRiskGuardian()` | `RiskAI.ts` |
| Journal insights + what-if | `generateJournalInsights()` | `RiskAI.ts` |

### Zero external API calls

All text generation — observations, coaching, scorecard descriptions, Kelly notes,
pattern descriptions — runs **locally in the browser, < 100ms**, with no LLM or API call.
`RiskAI.ts` was designed as a plug-in layer: the output interfaces (`RiskGuardianResult`,
`JournalInsights`, `BehaviorAnalysis`) are shaped to be replaceable by an LLM response
later without changing the UI.
