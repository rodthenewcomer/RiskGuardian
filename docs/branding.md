# RiskGuardian — Brand Identity & Design System

---

## Brand Positioning

**RiskGuardian** is an AI Risk OS for prop traders.

> "Trade with rules, not emotions."

The product sits at the intersection of **discipline tooling** and **behavioral coaching** — it is not a general trading platform. It is a focused, no-nonsense risk enforcement layer that protects funded accounts from emotional decision-making.

### Target Audience

- Funded prop traders (Tradeify, FTMO, Funding Pips, The5%ers)
- Traders who have blown accounts and want a systematic approach
- Performance-oriented traders who track everything
- Day traders trading NQ, ES, GC, BTCUSDT intraday

### Brand Promise

"RiskGuardian blocks bad trades before they happen, tells you why after they happen, and coaches you to stop making them."

---

## Logo

The RiskGuardian logo mark is implemented in `src/components/ui/Logo.tsx`.

- Logo color: `#FDC800` (accent yellow) — never any other color
- Logo should appear on dark backgrounds only
- Minimum display size: 24px height
- No drop shadows, no gradients on the logo mark itself
- Wordmark uses `var(--font-mono)` — monospace, terminal aesthetic

---

## Voice & Tone

### Overall

RiskGuardian speaks like a **stern, data-driven trading coach** — not a cheerleader, not a financial advisor. The product is direct, blunt, and precise.

| Attribute | Description |
|---|---|
| **Direct** | No fluff. State the fact then the implication. |
| **Precise** | Numbers are always exact — include dollar amounts, percentages to 1 decimal. |
| **Coaching, not blaming** | Observations identify patterns, not character flaws. |
| **Confident** | Never hedge. Say "You overtrade on Tuesdays" not "You might be trading a bit more on Tuesdays." |
| **Actionable** | Every insight ends with a specific, testable rule. |

### English Examples

**Good:**
- "Revenge trading cost you $340 this week. Mandatory 5-min break after any loss."
- "Your Tuesday win rate is 28% — below statistical significance. Stop trading Tuesdays."
- "Daily limit reached. The session is locked."

**Avoid:**
- "You seem to be trading a lot after losses — maybe consider taking breaks?"
- "Great job on those wins!"
- "It looks like your performance could possibly improve if..."

### French (FR) Voice

French copy uses **tu** for coaching messages (direct, personal) and **vous** for formal UI labels (settings, legal).

Trading vocabulary in French:
- "gains" not "profits"
- "solde" not "balance"
- "risque" not "risk"
- "séance" not "session" (for trading sessions in coaching text)
- "position" not "trade" when referring to an open trade
- "lot" stays as "lot"
- "levier" not "leverage"

---

## Design Philosophy

### Terminal Aesthetic

RiskGuardian's visual language is inspired by trading terminals (Bloomberg, TT, NinjaTrader). The design signals **professional-grade tooling** — not a consumer finance app.

Key principles:
- **Dark-first** — `#090909` background, never light mode in the app
- **No rounded corners** — `border-radius: 0` or `2px` max (neobrutalism)
- **Monospace for all data** — numbers and labels use `var(--font-mono)`, never sans-serif
- **Hard borders** — `1px solid #1a1c24` everywhere, no box-shadows for depth
- **Flat color** — no gradients on UI surfaces (gradients only in charts)
- **No emojis in UI** — terminal symbols only (⛔ ✓ → allowed in AI coaching text)
- **Tight spacing** — data density matters; information per pixel is high

### Neobrutalism Rules

- Offset shadows: `2px 2px 0 #FDC800` (accent) or `2px 2px 0 #ff4757` (danger) for CTAs only
- Border strokes are `#1a1c24` (dark) or the accent/danger color for states
- Buttons have no border-radius, and active/hover states use flat color shifts

---

## Typography

### Fonts

| Context | Font | Variable |
|---|---|---|
| Data, numbers, labels, tags, KPIs | Monospace system font | `var(--font-mono)` |
| Headings, section titles, marketing copy | Inter (or system sans-serif) | `var(--font-sans)` |

### Scale

| Level | Size | Weight | Font |
|---|---|---|---|
| Page title | 20–24px | 700 | sans |
| Section heading | 16–18px | 600 | sans |
| Card title | 14px | 600 | sans |
| Body text | 13–14px | 400 | sans |
| Data value (large KPI) | 28–36px | 700 | mono |
| Data value (normal) | 14–16px | 500–600 | mono |
| Label / caption | 11–12px | 400–500 | mono |
| Tab label | 11px | 500 | mono, uppercase, `letter-spacing: 0.1em` |

---

## Component Aesthetics

### Cards

```css
background: #0d1117;
border: 1px solid #1a1c24;
border-radius: 2px;
padding: 20px 24px;
```

### Buttons — Primary CTA

```css
background: #FDC800;
color: #090909;
border: none;
border-radius: 2px;
font-family: var(--font-mono);
font-weight: 600;
padding: 10px 20px;
```

### Buttons — Secondary

```css
background: transparent;
color: #c9d1d9;
border: 1px solid #1a1c24;
border-radius: 2px;
font-family: var(--font-mono);
padding: 10px 20px;
```

### Buttons — Danger

```css
background: transparent;
color: #ff4757;
border: 1px solid #ff4757;
border-radius: 2px;
```

### Input Fields

```css
background: #0d1117;
border: 1px solid #1a1c24;
border-radius: 2px;
color: #ffffff;
font-family: var(--font-mono);
padding: 10px 14px;
/* focused: border-color: #FDC800 */
```

### Tags / Badges

```css
/* WIN */
background: rgba(253,200,0,0.12);
color: #FDC800;
border: 1px solid #FDC800;
font-size: 11px;
padding: 2px 8px;

/* LOSS */
background: rgba(255,71,87,0.12);
color: #ff4757;
border: 1px solid #ff4757;
```

---

## Icon Usage

Icons use **Lucide React** (`lucide-react@0.577.0`).

- Icon color inherits from text color context (no explicit fill)
- Icon size for nav: 20px
- Icon size for inline text: 14–16px
- Never use emoji as icons in the app

---

## Motion & Animation

Animation uses **Framer Motion** (`framer-motion@12.35.0`).

### Standard Tab Transition

```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
transition={{ duration: 0.18 }}
```

### Standard Fade

```tsx
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
transition={{ duration: 0.15 }}
```

### Rules

- All transitions < 250ms — fast, professional
- No spring/bouncy animations — linear or ease-out only
- `AnimatePresence mode="wait"` for tab switches to prevent overlap
- No motion on data updates (charts re-render without animation)

---

## Responsive Breakpoints

| Breakpoint | Width | Context |
|---|---|---|
| Mobile | < 640px | BottomNav visible, sidebar hidden |
| Tablet | 640–1024px | Sidebar collapsed |
| Desktop | > 1024px | Sidebar expanded |

### Mobile Rules

- Touch targets minimum 44px height
- `env(safe-area-inset-bottom)` padding on BottomNav
- Dropdown max-height: 200px on mobile
- Numeric inputs: `pattern="[0-9]*"` for iOS numeric keyboard

---

## Landing Page Brand (Light Mode)

The `/` landing page uses a separate design language:

- Background: `#FBFBF9`
- Cards: `#ffffff` with `1px solid #e5e7eb`
- Primary accent: `#FDC800` (same brand yellow)
- Secondary accent: `#432DD7` (purple — landing only)
- Success: `#16A34A` (green for checkmarks — landing only)
- Text: `#1a1a1a` / `#374151`

> Landing page secondary colors (`#432DD7`, `#16A34A`) must never appear inside the `/app` route.

---

## Anti-Patterns

These are explicitly banned in the RiskGuardian design system:

| Banned | Use Instead |
|---|---|
| Pie charts (>3 slices) | Horizontal segmented bar |
| 3D charts | Flat 2D charts |
| Emoji in app UI | Terminal symbols or Lucide icons |
| `border-radius > 2px` | `border-radius: 0` or `2px` |
| Light backgrounds in app | `#090909` / `#0d1117` |
| Green for positive P&L | `#FDC800` (brand accent) |
| Generic AI coaching copy | Data-derived, numbered observations |
| Rounded avatar/image masks | Square crops only |
