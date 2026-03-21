-- ================================================================
-- RiskGuardian — Additional Tables (Migration 002)
-- ================================================================

-- Trade notes (extended journaling)
CREATE TABLE IF NOT EXISTS public.trade_notes (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trade_id    TEXT REFERENCES public.trades(id) ON DELETE CASCADE,
    body        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.trade_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade notes" ON public.trade_notes FOR ALL USING (auth.uid() = user_id);

-- Trade media references
CREATE TABLE IF NOT EXISTS public.trade_media (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trade_id    TEXT REFERENCES public.trades(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    label       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.trade_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade media" ON public.trade_media FOR ALL USING (auth.uid() = user_id);

-- AI coaching message history
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_messages_user_idx ON public.ai_messages(user_id, created_at DESC);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai messages" ON public.ai_messages FOR ALL USING (auth.uid() = user_id);

-- Pre-trade checklists / plans
CREATE TABLE IF NOT EXISTS public.trade_plans (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trade_id        TEXT REFERENCES public.trades(id) ON DELETE SET NULL,
    setup_confirmed BOOLEAN DEFAULT FALSE,
    news_checked    BOOLEAN DEFAULT FALSE,
    risk_checked    BOOLEAN DEFAULT FALSE,
    entry_reason    TEXT DEFAULT '',
    invalidation    TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.trade_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade plans" ON public.trade_plans FOR ALL USING (auth.uid() = user_id);

-- Cached analytics snapshots
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date   TEXT NOT NULL,
    data            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, snapshot_date)
);
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own analytics snapshots" ON public.analytics_snapshots FOR ALL USING (auth.uid() = user_id);

-- Behavioral pattern events (EdgeForensics output)
CREATE TABLE IF NOT EXISTS public.behavioral_events (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trade_id    TEXT REFERENCES public.trades(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    severity    TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
    detail      TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS behavioral_events_user_idx ON public.behavioral_events(user_id, created_at DESC);
ALTER TABLE public.behavioral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own behavioral events" ON public.behavioral_events FOR ALL USING (auth.uid() = user_id);

-- Notifications / alerts log
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT DEFAULT '',
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);
