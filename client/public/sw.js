// ShelfLife service worker — gives the app an offline shell and lets the
// browser show local notifications when items are expiring.
//
// Caching strategy:
// - App shell (HTML + JS + CSS chunks Vite generated): cache-first.
// - External APIs (Open Food Facts, TheMealDB, MobileNet weights): network-first
//   with cache fallback so the app still loads when offline.
// - Everything else: pass through to network.

// Bump these whenever you ship significant changes — forces returning users
// to drop their stale cached assets and pull the new build.
const SHELL_CACHE = 'shelflife-shell-v4';
const RUNTIME_CACHE = 'shelflife-runtime-v4';
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE && !k.startsWith('freshcheck-'))
            .map((k) => caches.delete(k))
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // App shell + same-origin assets: try cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
              return res;
            })
            .catch(() => caches.match('/'))
      )
    );
    return;
  }

  // Cross-origin: network-first, fall back to cache (lets the user view
  // already-scanned recipes / barcode lookups while offline).
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req) as Promise<Response>)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
