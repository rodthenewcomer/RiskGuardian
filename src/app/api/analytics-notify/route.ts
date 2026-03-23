import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// ── VAPID config (lazy — env vars not available at build time) ─
function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

// ── Rate limiter (20 req / 60s per IP) ────────────────────────
const rateMap = new Map<string, { count: number; reset: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

// ── Supabase admin client (server-side only) ──────────────────
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * POST /api/analytics-notify
 *
 * Body (sent by the app automatically — see usePushNotifications hook):
 *   { userId, payload: { title, body, url, tag } }
 *
 * Fetches all push subscriptions for the user from Supabase,
 * then calls webpush.sendNotification() for each device.
 *
 * Also accepts a direct subscription object for one-shot sends:
 *   { subscription: PushSubscription, payload: { title, body, url, tag } }
 */
export async function POST(req: NextRequest) {
  initVapid();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRate(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, subscription: directSub, payload } = body as {
    userId?: string;
    subscription?: PushSubscription;
    payload: { title: string; body: string; url?: string; tag?: string };
  };

  if (!payload?.title || !payload?.body) {
    return NextResponse.json({ error: 'payload.title and payload.body are required' }, { status: 400 });
  }

  const notifyPayload = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url  ?? '/app?tab=analytics',
    tag:   payload.tag  ?? 'rg-alert',
  });

  // ── One-shot: direct subscription provided ─────────────────
  if (directSub) {
    try {
      await webpush.sendNotification(directSub as unknown as webpush.PushSubscription, notifyPayload);
      return NextResponse.json({ sent: 1 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── User-level: fetch all subscriptions from Supabase ──────
  if (!userId) {
    return NextResponse.json({ error: 'userId or subscription required' }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, note: 'No subscriptions for user' });
  }

  const results = await Promise.allSettled(
    subs.map((row) =>
      webpush.sendNotification(row.subscription as webpush.PushSubscription, notifyPayload)
    )
  );

  const sent  = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  // Remove expired subscriptions (410 Gone from push service)
  const expiredIdxs: number[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = (r as PromiseRejectedResult).reason;
      if (err?.statusCode === 410) expiredIdxs.push(i);
    }
  });
  if (expiredIdxs.length > 0) {
    const expiredEndpoints = expiredIdxs.map((i) => (subs[i].subscription as webpush.PushSubscription).endpoint);
    await admin.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  return NextResponse.json({ sent, failed });
}

/**
 * DELETE /api/analytics-notify
 * Unsubscribes a device: removes its row from push_subscriptions.
 * Body: { endpoint: string }
 */
export async function DELETE(req: NextRequest) {
  initVapid();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRate(ip)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const { endpoint } = await req.json().catch(() => ({})) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });

  const admin = getAdmin();
  const { error } = await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
