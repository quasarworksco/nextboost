// NextBoost service worker — enables PWA install + basic offline shell.
// Strategy: network-first for everything (data must always be fresh);
// falls back to cache only when offline. Firebase/API calls are never cached.

const CACHE = 'nextboost-v1';
const SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/css/style.css',
  '/img/logo.png',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept cross-origin (Firebase, provider API, analytics, CDNs)
  if (url.origin !== self.location.origin) return;
  // Never cache non-GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Keep a fresh copy of same-origin static assets
        if (res.ok && (url.pathname.endsWith('.html') || url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.js') || url.pathname.endsWith('.png') ||
            url.pathname.endsWith('.svg') || url.pathname === '/')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
