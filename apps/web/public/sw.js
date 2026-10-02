// Waypoint Connect service worker: lets the driver and loader apps open with no signal.
// App files are cached; API calls are never cached here (the driver app keeps its own copy in IndexedDB).
const CACHE = 'waypoint-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo-mark.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Also cache the hashed JS/CSS that index.html points to, so the very first install works offline.
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await cache.addAll(assets);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // API calls, app downloads (APK) and Android app links are never cached.
  if (req.method !== 'GET' || /^\/(api|downloads|\.well-known)\//.test(url.pathname)) return;
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;

  // Pages: network first (so a new version shows up), the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return res; })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  // Files: cache first, then network (and keep a copy).
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
