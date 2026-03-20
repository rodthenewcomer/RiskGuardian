import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();

        // Instantiated inside handler so env vars are available at runtime
        const adminSupabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        if (!email || !password) {
            return Response.json({ error: 'Email and password required' }, { status: 400 });
        }

        // Create user with email pre-confirmed — no confirmation email sent
        const { data, error } = await adminSupabase.auth.admin.createUser({
            email: email.toLowerCase().trim(),
            password,
            email_confirm: true,
        });

        if (error) {
            return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json({ userId: data.user?.id, email: data.user?.email });
    } catch {
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
