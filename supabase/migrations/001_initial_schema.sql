-- ================================================================
-- RiskGuardian — Initial Schema
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Profiles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT,
    language    TEXT DEFAULT 'en',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Account Settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_settings (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                 UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance                 NUMERIC DEFAULT 0,
    daily_loss_limit        NUMERIC DEFAULT 0,
    max_risk_percent        NUMERIC DEFAULT 1,
    asset_type              TEXT DEFAULT 'crypto',
    currency                TEXT DEFAULT 'USD',
    prop_firm               TEXT,
    prop_firm_type          TEXT,
    max_drawdown_limit      NUMERIC,
    drawdown_type           TEXT DEFAULT 'EOD',
    leverage                NUMERIC DEFAULT 2,
    starting_balance        NUMERIC DEFAULT 0,
    highest_balance         NUMERIC DEFAULT 0,
    is_consistency_active   BOOLEAN DEFAULT FALSE,
    max_consecutive_losses  INTEGER,
    cool_down_minutes       INTEGER,
    max_trades_per_day      INTEGER,
    payout_lock_active      BOOLEAN DEFAULT FALSE,
    trading_day_roll_hour   INTEGER DEFAULT 17,
    language                TEXT DEFAULT 'en',
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own account settings"
    ON public.account_settings FOR ALL
    USING (auth.uid() = user_id);

-- ── Trades ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trades (
    id                TEXT PRIMARY KEY,
    user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    asset             TEXT NOT NULL,
    asset_type        TEXT NOT NULL DEFAULT 'crypto',
    entry             NUMERIC,
    stop_loss         NUMERIC,
    take_profit       NUMERIC,
    lot_size          NUMERIC DEFAULT 0,
    risk_usd          NUMERIC DEFAULT 0,
    reward_usd        NUMERIC DEFAULT 0,
    rr                NUMERIC DEFAULT 0,
    outcome           TEXT DEFAULT 'open',
    pnl               NUMERIC,
    is_short          BOOLEAN DEFAULT FALSE,
    note              TEXT DEFAULT '',
    tags              TEXT[] DEFAULT '{}',
    duration_seconds  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL,
    closed_at         TIMESTAMPTZ,
    synced_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trades_user_id_idx ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS trades_created_at_idx ON public.trades(user_id, created_at DESC);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trades"
    ON public.trades FOR ALL
    USING (auth.uid() = user_id);

-- ── Waitlist ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waitlist (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    lang        TEXT DEFAULT 'en',
    source      TEXT DEFAULT 'landing',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone can insert to waitlist (no auth required)
CREATE POLICY "Anyone can join waitlist"
    ON public.waitlist FOR INSERT
    WITH CHECK (true);

-- Only service role can read waitlist
CREATE POLICY "Service role reads waitlist"
    ON public.waitlist FOR SELECT
    USING (auth.role() = 'service_role');

-- ── Daily Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_sessions (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date             TEXT NOT NULL,
    risk_used        NUMERIC DEFAULT 0,
    trades_planned   INTEGER DEFAULT 0,
    guard_triggered  BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

ALTER TABLE public.daily_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own daily sessions"
    ON public.daily_sessions FOR ALL
    USING (auth.uid() = user_id);
