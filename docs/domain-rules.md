# RiskGuardian — Trading Domain Rules

---

## Trading Day Definition

RiskGuardian follows the **Tradeify trading day**, which rolls at **5:00 PM EST** (not midnight).

```typescript
// appStore.ts — getTradingDay()
// A trade at 4:59 PM EST belongs to the current day.
// A trade at 5:00 PM EST belongs to the next trading day.
```

This affects:
- Daily P&L calculations
- Daily loss limit enforcement
- Daily Guard trigger
- Trade count per day

---

## Session Grouping

A new **trading session** begins when the gap between consecutive trades exceeds **2 hours**.

```
Trade A at 09:00  ─┐
Trade B at 09:45   ├── Session 1
Trade C at 10:20  ─┘

[2h+ gap]

Trade D at 14:00  ─┐
Trade E at 14:30   ├── Session 2
```

Session duration:
```typescript
TradeSession.durationSeconds = Math.floor((closedAt - createdAt) / 1000)
```

This field **must be pre-computed** before passing trades to `EdgeForensics.generateForensics()`.
Always use `tradesWithDuration` (the useMemo-computed array in AnalyticsPage) — not the raw `trades` array.

---

## Behavioral Pattern Thresholds

### Revenge Trading

**Definition:** Re-entering a trade less than **5 minutes** after closing a loss.

```
Loss closed at 10:00:00
Next trade opened at 10:04:59  →  REVENGE
Next trade opened at 10:05:00  →  normal
```

**Session tag:** `REVENGE`
**Severity:** High

---

### Overtrading

**Definition:** More than **15 trades** in a single session.

```
Session with 16+ closed trades  →  OVERTRADING tag
```

**Session tag:** `OVERTRADING`
**Severity:** Medium

---

### Critical Session

**Definition:** Session total P&L loss exceeds **$1,000**.

```
Session P&L < -$1,000  →  CRITICAL tag
```

**Session tag:** `CRITICAL`
**Severity:** Critical (danger red)

---

### Held Loser

**Definition:** A losing trade held **50% longer** than the average winning trade duration.

```
avgWinDuration = 300 seconds
Hold threshold = 300 × 1.5 = 450 seconds

Losing trade held 451s+  →  Held Loser pattern
```

---

### Aged Open Trade

**Definition:** An open trade older than **4 hours** from creation.

Used in: Dashboard alert (clickable → Journal)

---

## Risk Management Rules

### Leverage Cap

Leverage limit is calculated using **`startingBalance`**, not the current `account.balance`.

**Why:** After a drawdown, current balance is lower than starting balance. Using current balance would allow the trader to take proportionally larger notional positions as their account shrinks, increasing risk. `startingBalance` is fixed at the beginning of the evaluation period.

```typescript
const maxNotional = account.startingBalance * account.leverage
// NOT: account.balance * account.leverage
```

---

### Drawdown Types

| Type | Behavior |
|---|---|
| **EOD (End-of-Day)** | Drawdown floor is recalculated from the account balance snapshot at 5 PM EST each day |
| **Trailing (End-of-Trade)** | Drawdown floor moves upward after every profitable trade closes. Never moves down. |
| **Static** | Floor is fixed: `startingBalance − maxDrawdownPct%`. Does not change during the evaluation. |

**Tradeify defaults:**
- 1-Step / Instant Funding → `Trailing`
- 2-Step Evaluation → `Static`

---

### Instant Funding Payout Lock

When `account.payoutLockActive === true` (Instant Funding accounts requesting payout):

- The `computeDrawdownFloor()` function uses a locked floor value
- AIChatPage refuses to compute trade risk calculations until the daily limit is restored
- Dashboard shows a payout lock warning

---

## Prop Firm Presets

| Firm | Daily Limit | Max Drawdown | Drawdown Type |
|---|---|---|---|
| Tradeify 1-Step | 3% | 6% | Trailing |
| Tradeify 2-Step | 3% | 6% | Static |
| Tradeify Instant Funding | 3% | 6% | EOD |
| Funding Pips | 5% | 10% | Static |
| FTMO | 5% | 10% | Static |
| The 5%ers | 4% | 8% | Trailing |
| Custom | configurable | configurable | configurable |

---

## Consistency Rules

When `account.isConsistencyActive === true`:

- `minHoldTimeSec` — minimum hold time per trade in seconds
- `maxTradesPerDay` — hard cap on trades per trading day
- `maxConsecutiveLosses` — triggers cooldown after N consecutive losses
- `coolDownMinutes` — mandatory wait after max consecutive losses

These are enforced in `tradeViolations.ts` and surfaced as warnings in CalculatorPage.

---

## autoSync Ordering

`autoSync()` in appStore sorts trades by:

```typescript
(a, b) => (a.closedAt ?? a.createdAt) - (b.closedAt ?? b.createdAt)
```

**Important:** Sort key is `closedAt ?? createdAt` — NOT `createdAt` alone.
An open trade (no `closedAt`) is sorted by its creation time.

---

## Asset Classification

Assets fall into these types (used in risk calculations):

| Asset Type | Pip/Tick Value Calc | Examples |
|---|---|---|
| Forex | Pip-based | EURUSD, GBPJPY |
| Index | Point-based | NQ, ES, YM, DAX |
| Crypto | Direct price | BTCUSDT, ETHUSDT |
| Commodity | Tick-based | GC (Gold), CL (Oil) |
| Custom | Manual input | — |

The asset list for Tradeify accounts is in `src/data/tradeifyAssets.ts`.

---

## Weekend Gap Risk

**Alert condition:** It is Friday evening (after 4 PM EST) or the weekend, AND there is at least one `outcome === 'open'` trade.

**Why:** Crypto markets stay open over the weekend. Traditional futures close. Unhedged open positions over the weekend are exposed to gap risk.

Displayed as: Warning banner on Dashboard (can be dismissed).

---

## PDF Import Rules (Tradeify)

The `parseTradeifyPDF.ts` parser is calibrated for Tradeify's PDF export format:

1. Extract raw text via pdfjs-dist (client-side, no server upload)
2. Parse trade rows via regex (asset, direction, entry, SL, TP, lots, P&L)
3. Map to `TradeSession[]` with `source: 'pdf'`
4. `autoSync()` is called after import to re-sort the trade list

---

## Trade Violations (`tradeViolations.ts`)

Violations are computed at trade entry time and surfaced as non-blocking warnings:

| Rule | Violation |
|---|---|
| Trade during cooldown period | `COOLDOWN_ACTIVE` |
| Daily trade count exceeded | `MAX_TRADES_EXCEEDED` |
| Trade below minimum hold time | `MIN_HOLD_TIME` |
| Entry after consecutive loss limit | `CONSECUTIVE_LOSSES` |
| Risk% above account max | `RISK_EXCEEDED` |
| Daily loss limit reached | `DAILY_LIMIT` |

All violations are **warnings** (non-blocking) unless `guardTriggered === true` (daily limit hit → locked).
