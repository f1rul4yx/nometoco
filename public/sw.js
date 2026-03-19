const CACHE_NAME = 'nometoco-v5';
const ASSETS = ['/', '/icon-192.png', '/icon-512.png', '/icon.svg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) { e.respondWith(fetch(e.request)); return; }
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE_NAME).then(ca => ca.put(e.request, cl)); }
      return r;
    })).catch(() => caches.match('/'))
  );
});

// Push from server
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'No Me Toco 🔔', body: '¿Te has tocado?' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'No Me Toco 🔔', {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'checkin',
    renotify: true,
    requireInteraction: true,
    vibrate: data.vibrate || [200, 100, 200]
  }));
});

// Tap notification → open app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.location.origin)) return c.focus();
      }
      return self.clients.openWindow(self.location.origin);
    })
  );
});
