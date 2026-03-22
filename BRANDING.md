# RiskGuardian — Design Tokens & Branding Reference

**Theme:** Neobrutalism — terminal-dark aesthetic
**Source of truth:** `src/app/globals.css` (`:root` block)

---

## Color Palette

### Brand Primaries

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#FDC800` | Wins, positive P&L, CTAs, primary brand color |
| `--secondary` | `#432DD7` | Electric purple — secondary brand, highlights |

### Accent Scale (yellow)

| Token | Value |
|---|---|
| `--accent` | `#FDC800` |
| `--accent-dim` | `rgba(253, 200, 0, 0.12)` |
| `--accent-soft` | `rgba(253, 200, 0, 0.20)` |
| `--accent-glow` | `rgba(253, 200, 0, 0.30)` |
| `--accent-border` | `rgba(253, 200, 0, 0.35)` |

### Secondary Scale (purple)

| Token | Value |
|---|---|
| `--secondary` | `#432DD7` |
| `--secondary-dim` | `rgba(67, 45, 215, 0.12)` |
| `--secondary-border` | `rgba(67, 45, 215, 0.35)` |

### Backgrounds — Pure Black Scale

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#090909` | Page / app shell background |
| `--bg-surface` | `#0F0F0F` | Subtle surface lift |
| `--bg-card` | `#141414` | Cards, panels |
| `--bg-elevated` | `#1C1C1C` | Popovers, modals, raised elements |
| `--bg-input` | `rgba(255,255,255,0.04)` | Form inputs |

### Borders — Opacity-based

| Token | Value | Usage |
|---|---|---|
| `--border-faint` | `rgba(255,255,255,0.04)` | Hairline separators |
| `--border-subtle` | `rgba(255,255,255,0.07)` | Default card borders |
| `--border-medium` | `rgba(255,255,255,0.11)` | Elevated elements |
| `--border-strong` | `rgba(255,255,255,0.18)` | Interactive focus rings |
| `--border-accent` | `var(--accent-border)` | Highlighted / active components |

### Text

| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#F5F5F5` | Body text, labels |
| `--text-secondary` | `#888888` | Supporting text |
| `--text-muted` | `#555555` | Hints, placeholders |
| `--text-disabled` | `#333333` | Disabled states |

### Semantic Colors

| Token | Value | Usage |
|---|---|---|
| `--color-danger` | `#DC2626` | Losses, errors, critical alerts |
| `--color-danger-dim` | `rgba(220, 38, 38, 0.12)` | Danger badge backgrounds |
| `--color-warning` | `#D97706` | Caution states |
| `--color-warning-dim` | `rgba(217, 119, 6, 0.12)` | Warning badge backgrounds |
| `--color-success` | `#16A34A` | Positive confirmations |
| `--color-success-dim` | `rgba(22, 163, 74, 0.12)` | Success badge backgrounds |

### Hard-coded UI constants (used in TSX where CSS vars aren't available)

| Constant | Value | Where used |
|---|---|---|
| Danger (bold) | `#ff4757` | Toast error, chart loss bars, ErrorBoundary |
| Warning | `#EAB308` | Toast warning |
| Info blue | `#38bdf8` | Toast info, chart info color |
| Chart card bg | `#0d1117` | `RiskGuardianPrimitives.tsx` |
| Chart card border | `#1a1c24` | `RiskGuardianPrimitives.tsx` |

> Note: `#DC2626` is the semantic CSS token for danger; `#ff4757` is the bolder in-chart variant. Use `--color-danger` for UI, `#ff4757` only inside Recharts/SVG contexts.

---

## Typography

### Font Stacks

| Token | Value | Usage |
|---|---|---|
| `--font-base` | `'Inter', system-ui, sans-serif` | Body text, buttons, UI |
| `--font-head` | `'Inter', system-ui, sans-serif` | Headings (same stack, heavier weight) |
| `--font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | All numbers, data, labels, inputs |

Both fonts are loaded via Google Fonts in `globals.css`:
- Inter: weights 300, 400, 500, 600, 700, 800
- JetBrains Mono: weights 400, 500, 600, 700

### Rule: mono for data, sans for headings

```
var(--font-mono) → all numbers, P&L values, prices, stats, inputs
var(--font-base) → headings, nav labels, body copy, buttons
```

### Type Scale (utility classes)

| Class | Size | Weight | Notes |
|---|---|---|---|
| `.text-display` | 28px | 800 | Hero numbers, page titles |
| `.text-heading` | 22px | 700 | Section headings |
| `.text-subheading` | 17px | 700 | Card titles |
| `.text-body` | 14px | 400 | Body text |
| `.text-caption` | 12px | 400 | Supporting labels |
| `.text-mono` | 14px | — | Monospace data |

### Number Display Scale

| Class | Size | Usage |
|---|---|---|
| `.number-display--xl` | 34px | Balance, primary KPI |
| `.number-display--lg` | 26px | Secondary KPI |
| `.number-display--md` | 18px | Stat row values |

---

## Shadows

### Neobrutalism Hard Shadows

| Token | Value |
|---|---|
| `--shadow-brutal` | `4px 4px 0px #1C293C` |
| `--shadow-brutal-sm` | `2px 2px 0px #1C293C` |
| `--shadow-brutal-accent` | `4px 4px 0px #FDC800` |

### Depth Shadows

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 4px rgba(0,0,0,0.6)` |
| `--shadow-md` | `0 4px 20px rgba(0,0,0,0.7)` |
| `--shadow-lg` | `0 8px 40px rgba(0,0,0,0.8)` |

### Glow Shadows

| Token | Value |
|---|---|
| `--shadow-accent` | `0 0 20px rgba(253,200,0,0.18)` |
| `--shadow-danger` | `0 0 20px rgba(220,38,38,0.18)` |

---

## Border Radius

Neobrutalism uses near-zero radius — sharp, terminal aesthetic.

| Token | Value |
|---|---|
| `--radius-xs` | `2px` |
| `--radius-sm` | `2px` |
| `--radius-md` | `2px` |
| `--radius-lg` | `4px` |
| `--radius-xl` | `4px` |
| `--radius-full` | `9999px` (pill — badges only) |

> Never use `border-radius > 4px` except for `.badge` (pill shape).

---

## Spacing Scale

| Token | Alias | Value |
|---|---|---|
| `--space-1` | `--spacing-xs` | `4px` |
| `--space-2` | `--spacing-sm` | `8px` |
| `--space-3` | — | `12px` |
| `--space-4` | `--spacing-md` | `16px` |
| `--space-5` | — | `20px` |
| `--space-6` | `--spacing-lg` | `24px` |
| `--space-8` | `--spacing-xl` | `32px` |
| `--space-10` | — | `40px` |
| `--space-12` | `--spacing-2xl` | `48px` |

---

## Transitions

| Token | Value | Usage |
|---|---|---|
| `--t-fast` | `0.10s ease` | Hover states, focus rings |
| `--t-normal` | `0.20s ease` | Panel reveals, toggles |
| `--t-slow` | `0.36s cubic-bezier(0.4,0,0.2,1)` | Page transitions, modals |

---

## Layout Dimensions

| Token | Value |
|---|---|
| `--nav-height` | `60px` |
| `--bottom-nav-height` | `72px` |
| `--max-width` | `480px` (mobile-first cap) |
| `--sidebar-width-sm` | `64px` (icon-only, ≥768px) |
| `--sidebar-width-lg` | `200px` (full labels, ≥1024px) |

---

## Card System

| Class | Background | Border |
|---|---|---|
| `.glass-card` | `--bg-card` | `--border-subtle` |
| `.glass-card--elevated` | `--bg-elevated` | `--border-medium` |
| `.glass-card--primary` | — | `--accent-border` + accent glow |
| `.glass-card--danger` | — | `rgba(255,71,87,0.25)` + danger glow |

> Despite the `.glass-card` name, there is no `backdrop-filter` — flat dark cards only.

---

## Button Variants

| Class | Background | Text | Height |
|---|---|---|---|
| `.btn--primary` | `#FDC800` | `#000` | `52px` |
| `.btn--success` | `#FDC800` | `#000` | `52px` |
| `.btn--danger` | `#DC2626` | `#fff` | `52px` |
| `.btn--ghost` | transparent | `--text-secondary` | `40px` |
| `.btn--icon` | `--bg-elevated` | `--text-secondary` | `40px` |
| `.btn--sm` | — | — | `34px` |

Primary button hover: `#B8FF66` (lime shift — intentional neobrutalism pop)

---

## Chart Color Conventions

All charts use these fixed values (CSS vars not available in Recharts):

| Role | Value |
|---|---|
| Win / positive | `#FDC800` |
| Loss / negative | `#ff4757` |
| Neutral / info | `#38bdf8` |
| Chart background | `#0d1117` |
| Chart border | `#1a1c24` |
| Axis / grid text | `#8b949e` |
| Secondary text | `#c9d1d9` |
| Muted text | `#4b5563` |

---

## Animations

| Class | Keyframe | Duration |
|---|---|---|
| `.animate-slide-up` | `slide-up` (translateY 12px → 0) | `0.3s ease` |
| `.animate-fade-in` | `fade-in` (opacity 0 → 1) | `0.2s ease` |
| `.animate-glow` | `glow-pulse` (opacity 0.6 ↔ 1) | `2s infinite` |

Ring pulse animations (`pulse-ring`, `pulse-danger`) used on status indicators.

---

## Back-Compatibility Aliases

Old token names still work — they point to the current tokens:

| Old token | Points to |
|---|---|
| `--color-primary` | `--accent` |
| `--color-primary-dim` | `--accent-dim` |
| `--color-primary-glow` | `--accent-glow` |
| `--color-purple` | `--secondary` |
| `--color-purple-dim` | `--secondary-dim` |
| `--bg-glass` | `--bg-card` |
| `--border-primary` | `--border-accent` |
| `--shadow-glow` | `--shadow-accent` |
| `--shadow-success` | `--shadow-accent` |

---

## Quick Reference — Most Used Tokens

```css
/* Brand */
var(--accent)           /* #FDC800  primary yellow */
var(--secondary)        /* #432DD7  electric purple */
var(--color-danger)     /* #DC2626  loss/error red */

/* Backgrounds */
var(--bg-base)          /* #090909  page */
var(--bg-card)          /* #141414  cards */
var(--bg-elevated)      /* #1C1C1C  modals/popovers */

/* Text */
var(--text-primary)     /* #F5F5F5  */
var(--text-secondary)   /* #888888  */
var(--text-muted)       /* #555555  */

/* Fonts */
var(--font-mono)        /* JetBrains Mono — all numbers/data */
var(--font-base)        /* Inter — headings and UI copy */

/* Spacing */
var(--space-4)          /* 16px — standard component padding */
var(--space-6)          /* 24px — section gaps */
var(--space-8)          /* 32px — page-level spacing */
```
