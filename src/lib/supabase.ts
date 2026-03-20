'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — only created at runtime when env vars are available
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
            }
        );
    }
    return _supabase;
}

// Proxy so all call sites keep `supabase.auth.xxx` syntax unchanged
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
    },
});

export type SupabaseUser = Awaited<ReturnType<SupabaseClient['auth']['getUser']>>['data']['user'];
