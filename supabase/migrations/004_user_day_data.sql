-- ================================================================
-- RiskGuardian - Migration 004: Persist day notes and session journals
-- ================================================================

CREATE TABLE IF NOT EXISTS public.user_day_data (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    day_notes    JSONB NOT NULL DEFAULT '{}',
    day_journal  JSONB NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_day_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_day_data'
          AND policyname = 'Users manage own day journal data'
    ) THEN
        CREATE POLICY "Users manage own day journal data"
            ON public.user_day_data
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;
