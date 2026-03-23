'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type PushStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported';

const SW_PATH  = '/sw.js';
const VAPID_PK = process.env.NEXT_PUBLIC_VAPID_KEY!;

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

/**
 * usePushNotifications
 *
 * Handles the full push notification lifecycle:
 *  1. Registers the service worker (/sw.js)
 *  2. Requests Notification permission from the browser
 *  3. Creates a PushSubscription and saves it to Supabase push_subscriptions
 *  4. Exposes helpers to send test / analytics-driven notifications
 *
 * SQL to run once in Supabase:
 *
 *   CREATE TABLE IF NOT EXISTS push_subscriptions (
 *     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 *     endpoint    text NOT NULL UNIQUE,
 *     subscription jsonb NOT NULL,
 *     created_at  timestamptz NOT NULL DEFAULT now()
 *   );
 *   ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "owner" ON push_subscriptions
 *     USING (auth.uid() = user_id)
 *     WITH CHECK (auth.uid() = user_id);
 *   CREATE INDEX ON push_subscriptions (user_id);
 */
export function usePushNotifications(userId: string | null) {
  const [status, setStatus] = useState<PushStatus>('idle');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // ── Check existing permission on mount ──────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    if (Notification.permission === 'granted') {
      // Restore existing subscription silently
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription()
      ).then((sub) => {
        if (sub) { setSubscription(sub); setStatus('granted'); }
      }).catch(() => {/* ignore */});
    }
  }, []);

  // ── Register SW + request permission + subscribe ────────────
  const enable = useCallback(async () => {
    if (!userId) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    setStatus('loading');
    try {
      // 1. Register service worker
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
      await navigator.serviceWorker.ready;

      // 2. Request notification permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return; }

      // 3. Create push subscription
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PK),
      });

      // 4. Save to Supabase
      const { error } = await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint: sub.endpoint, subscription: sub.toJSON() },
        { onConflict: 'endpoint' }
      );
      if (error) throw new Error(error.message);

      setSubscription(sub);
      setStatus('granted');
    } catch (err) {
      console.error('Push enable error:', err);
      setStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
    }
  }, [userId]);

  // ── Disable: unsubscribe + remove from Supabase ─────────────
  const disable = useCallback(async () => {
    if (!subscription) return;
    try {
      await fetch('/api/analytics-notify', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setStatus('idle');
    } catch (err) {
      console.error('Push disable error:', err);
    }
  }, [subscription]);

  // ── Send a notification to THIS device (test / analytics) ───
  const send = useCallback(async (payload: {
    title: string;
    body:  string;
    url?:  string;
    tag?:  string;
  }) => {
    if (!subscription) return;
    await fetch('/api/analytics-notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subscription: subscription.toJSON(), payload }),
    });
  }, [subscription]);

  // ── Broadcast to all user devices (server-side, requires userId) ──
  const broadcast = useCallback(async (payload: {
    title: string;
    body:  string;
    url?:  string;
    tag?:  string;
  }) => {
    if (!userId) return;
    await fetch('/api/analytics-notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, payload }),
    });
  }, [userId]);

  return { status, subscription, enable, disable, send, broadcast };
}
