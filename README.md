# RiskGuardian — AI Risk OS for Prop Traders

> Trade with rules, not emotions.

RiskGuardian is a real-time risk management OS built for funded/prop trading accounts. It enforces daily loss limits, calculates precise position sizes, journals every trade, and uses AI behavioral analysis to identify patterns that cost you money.

## Features

- **Daily Loss Guard** — Hard-blocks trading when limit is reached
- **Risk Calculator** — Exact lot size for 1-2% risk per trade
- **AI Behavioral Coach** — Detects revenge trading, overtrading, tilt
- **Advanced Trade Journal** — Log, tag, filter, review every trade
- **Deep Analytics** — 10 tabs: equity curve, win rate, drawdown, heatmap, radar, and more
- **Instant TP/SL Calculator** — Full trade plan in 5 seconds
- **Prop Firm Presets** — Tradeify, FTMO, Funding Pips, 5%ers, custom rules

## Tech Stack

- Next.js 16 (App Router) · TypeScript · Zustand · Framer Motion · Recharts
- Auth: Supabase (email + Google OAuth)
- Styling: Inline styles (Calculator/Dashboard) + CSS Modules + Tailwind (Analytics)
- AI: Local NLP (zero API calls) — `src/ai/RiskAI.ts` + `src/ai/EdgeForensics.ts`
- PWA: manifest.json + service worker

## Brand

- Primary: `#FDC800` (yellow)
- Secondary: `#432DD7` (purple)
- Background: `#090909` (app), `#FBFBF9` (landing)
- Danger: `#ff4757` | Warning: `#EAB308` | Success: `#16A34A`
- Typography: `var(--font-mono)` for data, `Inter` for headings
- Design: Neobrutalism — hard borders, flat color, no border-radius, offset shadows

## Architecture

```
src/
  app/           Next.js routes (/ landing, /app main app)
  components/
    pages/       DashboardPage, CalculatorPage, JournalPage, AnalyticsPage, AIChatPage, SettingsPage, Onboarding, LandingPage
    layout/      Header, Sidebar, BottomNav
    charts/      Reusable Recharts components
    ui/          Toast, Logo
    auth/        AuthPage, AuthModal
  store/         appStore.ts — Zustand with localStorage persistence
  ai/            RiskAI.ts (NLP), EdgeForensics.ts (pattern engine)
  lib/           supabase.ts, supabaseSync.ts, dxtradeSync.ts
  i18n/          EN/FR translations
```

## Development

```bash
npm install
cp .env.local.example .env.local   # add Supabase keys
npm run dev
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Prop Firm Support

Tradeify Crypto (Instant + Eval), FTMO, Funding Pips, The 5%ers, custom rules. Daily loss limits and max drawdown auto-calculated from account balance.

## Domain Rules

- Trading day rolls at 5PM EST (Tradeify rule)
- Session gap = 2h+ between trades
- Revenge trade = re-entry <5min after loss
- Overtrading = >15 trades/session
