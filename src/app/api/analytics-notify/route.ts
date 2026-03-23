import { NextResponse } from 'next/server';

// PWA push notification endpoint — P20 stub
// Full implementation requires:
//   1. VAPID key pair in env vars (NEXT_PUBLIC_VAPID_KEY, VAPID_PRIVATE_KEY)
//   2. web-push npm package
//   3. Push subscription stored per user in Supabase
// Rate limited: 20 req/60s per IP (matching existing API routes)

export async function POST() {
  return NextResponse.json(
    { error: 'Push notifications not yet configured. Add VAPID keys to enable.' },
    { status: 501 }
  );
}
