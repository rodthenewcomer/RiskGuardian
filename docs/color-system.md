# RiskGuardian — Color System

---

## Philosophy

RiskGuardian uses a **terminal-dark color system** derived from neobrutalism principles.
Every color has a single semantic meaning — never reuse a color for a different intent.
The palette is designed to be instantly readable at a glance: green/yellow = good, red = danger, blue = information.

---

## Core Palette

### Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `bg-page` | `#090909` | Root page background (body, layout wrapper) |
| `bg-card` | `#0d1117` | Card surface, panel, modal background |
| `bg-sub-card` | `#0b0e14` | Nested card, secondary panel, sub-section |
| `bg-hover` | `#111318` | Hover state on dark surfaces |
| `bg-input` | `#0d1117` | Input field background |

### Borders

| Token | Hex | Usage |
|---|---|---|
| `border-default` | `#1a1c24` | All card borders, section dividers, input outlines |
| `border-accent` | `#FDC800` | Focused input, active tab indicator, CTA border |
| `border-danger` | `#ff4757` | Error state, critical alert border |

### Brand Accent — Yellow

| Token | Hex | Usage |
|---|---|---|
| `accent` | `#FDC800` | Primary CTA buttons, win highlights, positive P&L, active tab underline, logo mark |
| `accent-dim` | `rgba(253,200,0,0.12)` | Accent background fills (badge bg, hover bg for yellow buttons) |
| `accent-glow` | `rgba(253,200,0,0.25)` | Box-shadow glow on focused CTA inputs |

> `#FDC800` is the primary brand color. It must never be used for negative states.

### Danger — Red

| Token | Hex | Usage |
|---|---|---|
| `danger` | `#ff4757` | Loss P&L, critical alerts, guard triggered, daily limit hit, session CRITICAL tag |
| `danger-dim` | `rgba(255,71,87,0.12)` | Loss row background, danger badge fill |

### Warning — Yellow/Amber

| Token | Hex | Usage |
|---|---|---|
| `warning` | `#EAB308` | Non-critical warnings, aged open trade alert, consistency warnings |
| `warning-dim` | `rgba(234,179,8,0.12)` | Warning badge background |

> Note: `#EAB308` (Tailwind `yellow-500`) is distinct from brand `#FDC800`. Do not swap them.

### Info — Blue

| Token | Hex | Usage |
|---|---|---|
| `info` | `#38bdf8` | Informational notes, DXTrade sync indicators, neutral-state badges |
| `info-dim` | `rgba(56,189,248,0.12)` | Info badge background |

### Orange

| Token | Hex | Usage |
|---|---|---|
| `orange` | `#F97316` | Secondary accent, highlight for OPEN trade status |
| `orange-light` | `#fb923c` | Lighter orange variant, streak highlights |

### Success (Landing page only)

| Token | Hex | Usage |
|---|---|---|
| `success` | `#16A34A` | Used exclusively on the landing page for social proof / green checkmarks |

> `#16A34A` must NOT appear inside the app UI. Use `#FDC800` for positive states in the app.

---

## Text Colors

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#ffffff` | All primary labels, headings, important values |
| `text-secondary` | `#c9d1d9` | Supporting text, table body, subtitle copy |
| `text-muted` | `#8b949e` | Placeholder text, disabled labels, metadata |
| `text-dim` | `#6b7280` | Ghost labels, tab inactive, footer notes |
| `text-ghost` | `#4b5563` | The least important text, de-emphasised hints |
| `text-accent` | `#FDC800` | Highlighted numbers (profit, win count) |
| `text-danger` | `#ff4757` | Highlighted numbers (loss, violations) |
| `text-warning` | `#EAB308` | Warning copy, aged trade text |

---

## Semantic Color Mapping

### P&L Display

```
Positive P&L value  →  #FDC800  (accent yellow)
Negative P&L value  →  #ff4757  (danger red)
Zero / flat P&L     →  #8b949e  (muted)
Open P&L            →  #38bdf8  (info blue)
```

### Trade Outcome Tags

```
WIN   →  background: rgba(253,200,0,0.12)  |  text: #FDC800  |  border: #FDC800
LOSS  →  background: rgba(255,71,87,0.12)  |  text: #ff4757  |  border: #ff4757
OPEN  →  background: rgba(249,115,22,0.12) |  text: #F97316  |  border: #F97316
```

### Session Tags (EdgeForensics)

```
CLEAN        →  #FDC800
REVENGE      →  #ff4757
OVERTRADING  →  #EAB308
CRITICAL     →  #ff4757 (bold, with danger-dim bg)
```

### Scorecard Grades

```
A  →  #FDC800
B  →  #38bdf8
C  →  #EAB308
D  →  #F97316
F  →  #ff4757
```

### Chart Colors

```
Win bars / area      →  #FDC800 (or rgba(253,200,0,0.8) with gradient)
Loss bars / area     →  #ff4757 (or rgba(255,71,87,0.8))
Rolling average line →  #FDC800 dashed
Equity curve up      →  gradient: #FDC800 → rgba(253,200,0,0)
Equity curve down    →  gradient: #ff4757 → rgba(255,71,87,0)
Neutral/reference    →  #38bdf8
CartesianGrid        →  rgba(255,255,255,0.04)
Tooltip background   →  #0d1117 with border #1a1c24
```

---

## Landing Page Colors

The landing page (`LandingPage.tsx`) uses a separate light-mode palette — do not mix with app colors.

| Token | Hex | Usage |
|---|---|---|
| `landing-bg` | `#FBFBF9` | Landing page background |
| `landing-card` | `#ffffff` | Feature cards, pricing cards |
| `landing-text` | `#1a1a1a` | Primary landing text |
| Landing accent | `#FDC800` | CTAs, highlighted text (same brand yellow) |
| Landing secondary | `#432DD7` | Purple secondary accent (landing only) |

---

## Usage Rules

1. **Never use a success green (#16A34A) in the app** — positive P&L uses `#FDC800`
2. **Never use pure white (#ffffff) for backgrounds** — use the `#090909` / `#0d1117` system
3. **Never reuse danger red for warnings** — use `#EAB308` for non-critical warnings
4. **Never hardcode rgba opacity without a comment** — document what state it represents
5. **Alpha fills must use the token's base hex** — e.g., `rgba(253,200,0,0.12)` not an arbitrary yellow

---

## CSS Variables (root layout)

```css
:root {
  --bg-page:      #090909;
  --bg-card:      #0d1117;
  --bg-sub-card:  #0b0e14;
  --border:       #1a1c24;
  --accent:       #FDC800;
  --danger:       #ff4757;
  --warning:      #EAB308;
  --info:         #38bdf8;
  --orange:       #F97316;
  --text-primary: #ffffff;
  --text-secondary: #c9d1d9;
  --text-muted:   #8b949e;
  --text-dim:     #6b7280;
  --text-ghost:   #4b5563;
}
```

> These variables are defined in the global stylesheet. Use `var(--accent)` in CSS Modules. Use raw hex in inline styles (Calculator, Dashboard pages).
