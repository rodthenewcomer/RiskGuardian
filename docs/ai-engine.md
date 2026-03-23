# RiskGuardian — AI & Behavioral Engine

---

## Overview

RiskGuardian's "AI" is a **local NLP and statistical engine** — zero external API calls, zero latency, works offline. All text generation, pattern detection, and scoring run in the browser in under 100ms.

The engine has three layers:

```
EdgeForensics.ts  →  Session tagging + 14 behavioral patterns + scorecard
RiskAI.ts         →  Kelly Criterion + risk scoring + coaching text
SimulationEngine  →  What-if scenario testing
```

The output interfaces (`RiskGuardianResult`, `JournalInsights`, `BehaviorAnalysis`) are designed as plug-in layers — they can be replaced by an LLM response without changing the UI.

---

## EdgeForensics (`src/ai/EdgeForensics.ts`)

**Size:** 51 KB
**Entry point:** `generateForensics(trades: TradeSession[], account: AccountSettings)`

### What it does

1. Groups trades into sessions (2h+ gap = new session)
2. Tags each session with behavioral labels
3. Detects 14 behavioral patterns across all sessions
4. Computes an 8-metric scorecard with A–F grades

### Session Tagging

Each `TradeSession[]` group gets one or more tags:

| Tag | Condition |
|---|---|
| `CLEAN` | No violations detected in the session |
| `REVENGE` | Any trade re-entered < 5 minutes after a loss |
| `OVERTRADING` | Session contains > 15 trades |
| `CRITICAL` | Session total P&L loss > $1,000 |

A session can have multiple tags (e.g., `REVENGE + OVERTRADING`).

### 14 Behavioral Patterns

Each pattern includes: `frequency`, `impact` ($), `severity` (low/medium/high/critical), and `evidence[]` (specific trade IDs or timestamps).

| # | Pattern | Detection Logic |
|---|---|---|
| 1 | **Revenge Trading** | Re-entry < 5min after loss |
| 2 | **Held Losers** | Losing trade held 50%+ longer than avg win duration |
| 3 | **Early Exit** | Winning trade closed before hitting TP (by >20% of range) |
| 4 | **Spike Vulnerability** | Loss occurring within 5 min of a market open/spike window |
| 5 | **Micro Overtrading** | >5 trades in a single 30-min window |
| 6 | **Consistency Breakdown** | Lot size deviation > 50% from account's standard lot |
| 7 | **Daily Loss Cycles** | 3+ consecutive trading days with net negative P&L |
| 8 | **Session Abandonment** | Session ended with an open position (not closed, not pending) |
| 9 | **Consecutive Loss Streaks** | 4+ consecutive losses in one session |
| 10 | **Time Clustering** | 70%+ of losses occur in a specific 2h time window |
| 11 | **Instrument Weakness** | Win rate < 35% on a specific asset with > 5 trades |
| 12 | **Risk Deviation** | Average risk-per-trade deviates > 30% from account max |
| 13 | **Win Rate Collapse** | Rolling 5-trade win rate < 25% |
| 14 | **Recovery Failure** | Loss after a winning streak (4+) — failed recovery attempt |

### Scorecard — 8 Metrics

Graded A / B / C / D / F with specific numeric thresholds.

| Metric | A | B | C | D | F |
|---|---|---|---|---|---|
| Win Rate | ≥ 60% | ≥ 50% | ≥ 40% | ≥ 30% | < 30% |
| Profit Factor | ≥ 2.0 | ≥ 1.5 | ≥ 1.2 | ≥ 1.0 | < 1.0 |
| Expectancy ($/trade) | ≥ $50 | ≥ $25 | ≥ $0 | < $0 | < -$50 |
| Consistency | ≥ 80% | ≥ 65% | ≥ 50% | ≥ 35% | < 35% |
| Max Drawdown | ≤ 2% | ≤ 4% | ≤ 6% | ≤ 8% | > 8% |
| Monthly Avg | ≥ $1,000 | ≥ $500 | ≥ $0 | < $0 | < -$500 |
| Trade Quality | ≥ 80% | ≥ 65% | ≥ 50% | ≥ 35% | < 35% |
| Risk Compliance | ≥ 90% | ≥ 75% | ≥ 60% | ≥ 45% | < 45% |

**Trade Quality** = percentage of trades that hit TP or were closed manually with positive P&L (excludes SL hits, timed-out trades, and trades with unusual lot sizes).

### Output Type

```typescript
interface ForensicsResult {
  sessions: SessionGroup[]
  patterns: BehaviorPattern[]
  scorecard: ScorecardMetric[]
  evidence: EvidenceRecord[]
}

interface SessionGroup {
  trades: TradeSession[]
  tags: ('CLEAN' | 'REVENGE' | 'OVERTRADING' | 'CRITICAL')[]
  startTime: number
  endTime: number
  pnl: number
  tradeCount: number
}

interface BehaviorPattern {
  name: string
  frequency: number
  impact: number          // dollar amount
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence: string[]      // trade IDs or time range strings
  description: string     // data-driven, includes exact numbers
  coaching: string        // actionable rule derived from the data
}
```

---

## RiskAI (`src/ai/RiskAI.ts`)

**Size:** 118 KB
**Entry points:** `analyzeRiskGuardian()`, `generateJournalInsights()`, `generateCoachingText()`

### `analyzeRiskGuardian(trades, account)`

Computes:

- **Kelly Criterion** — Optimal position sizing based on win rate and W/L ratio
  ```
  Kelly% = W - (1-W)/R
  where W = win rate, R = avg win / avg loss
  ```
- **Rank scoring** — Composite score 0–100 from win rate, profit factor, consistency, drawdown
- **Regime detection** — Detects if current performance is in a "hot" or "cold" regime
- **Risk Guardian text** — Specific, number-driven summary of account health

### `generateJournalInsights(trades)`

Returns a `JournalInsights` object with:

- What-if analysis: "If you had not revenge-traded on Tuesday, you would be +$340 this week"
- Best/worst asset by expectancy
- Optimal session time window
- Suggested daily stop loss based on historical drawdowns

### `generateCoachingText(behaviorAnalysis)`

Takes `BehaviorAnalysis` from EdgeForensics and produces human-readable coaching strings that include the trader's actual dollar amounts, percentages, and trade counts.

**Coaching strings are never generic.** They always include:
- The specific pattern name
- The exact dollar impact from the data
- One specific, testable rule to apply

```
GOOD: "Revenge trading cost you $340 this week across 4 sessions.
       Mandatory 5-min break after any loss."

BAD:  "Try to avoid trading impulsively after losses."
```

### Output Interfaces

```typescript
interface RiskGuardianResult {
  score: number               // 0–100
  regime: 'hot' | 'cold' | 'neutral'
  kellyPct: number
  guardianText: string        // paragraph summary
  kellyNote: string           // specific sizing recommendation
}

interface JournalInsights {
  whatIfPnl: number           // P&L without worst pattern
  bestAsset: string
  worstAsset: string
  optimalWindow: string
  suggestedDailyStop: number
}
```

---

## SimulationEngine (`src/ai/SimulationEngine.ts`)

**Size:** 22 KB
**Entry point:** `simulateWithRules(trades, config)`

### What it does

Runs a what-if simulation over the trade history with modified rules and computes:

- `blockedCount` — trades that would have been blocked by the new rules
- `modifiedCount` — trades that would have had reduced lot size
- `savedCapital` — total loss avoided
- `actualPnl` — real historical P&L
- `simPnl` — P&L under the simulated rules
- `delta` — simPnl − actualPnl

### Saved Scenarios

- Maximum **3 saved scenarios** (FIFO — oldest is replaced when a 4th is added)
- Stored in Zustand as `savedScenarios: SavedScenario[]`
- Each scenario includes: name, savedAt timestamp, mode, config, and all computed metrics

---

## Text Generation Rules

All text generated by the AI engine follows these rules:

1. **Numbers must be exact** — computed from actual trade data, never estimated or hardcoded
2. **Dollar amounts** — always include `$` prefix, formatted with 2 decimal places
3. **Percentages** — always 1 decimal place (e.g., "62.4%", not "62%")
4. **Trade counts** — exact integers ("4 trades", not "several trades")
5. **Coaching actions** — present tense, imperative mood ("Stop trading Tuesdays" not "You should consider...")
6. **No generic copy** — if the pattern didn't appear in the trader's data, don't mention it

---

## Integration with AnalyticsPage

```
AnalyticsPage.tsx
  ├── useMemo: tradesWithDuration (ensures durationSeconds on all trades)
  ├── useMemo: filteredTrades (date range filter applied)
  ├── useMemo: forensics = EdgeForensics.generateForensics(filteredTrades, account)
  ├── useMemo: riskAnalysis = RiskAI.analyzeRiskGuardian(filteredTrades, account)
  └── 11 tabs render from forensics + riskAnalysis data
```

The `PATTERNS (N)` tab label is dynamic: `N = forensics.patterns.length`.

The forensics result also drives:
- SESSIONS tab (session tags, timeline)
- SCORECARD tab (8 graded metrics)
- VERDICT tab (full coaching summary)
- COMPARE tab (period-over-period deltas)
