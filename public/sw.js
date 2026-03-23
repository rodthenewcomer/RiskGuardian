/* RiskGuardian — Service Worker for PWA push notifications */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'RiskGuardian', body: event.data.text(), url: '/app?tab=analytics' };
  }

  const title = data.title ?? 'RiskGuardian';
  const options = {
    body:    data.body  ?? '',
    icon:    data.icon  ?? '/favicon.svg',
    badge:   '/favicon.svg',
    tag:     data.tag   ?? 'rg-alert',
    data:    { url: data.url ?? '/app?tab=analytics' },
    requireInteraction: data.requireInteraction ?? false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/app?tab=analytics';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/app'));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
