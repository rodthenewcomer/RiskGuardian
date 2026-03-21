-- ================================================================
-- RiskGuardian — Migration 003: Add missing columns
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- Add min_hold_time_sec to account_settings (was in app but missing from schema)
ALTER TABLE public.account_settings
    ADD COLUMN IF NOT EXISTS min_hold_time_sec INTEGER;

-- Ensure account_settings INSERT policy exists (users need to create their first row)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'account_settings'
        AND policyname = 'Users can insert own account settings'
    ) THEN
        CREATE POLICY "Users can insert own account settings"
            ON public.account_settings FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- Index on account_settings for faster lookups
CREATE INDEX IF NOT EXISTS account_settings_user_id_idx ON public.account_settings(user_id);

-- Index on daily_sessions for date lookups
CREATE INDEX IF NOT EXISTS daily_sessions_user_date_idx ON public.daily_sessions(user_id, date);
