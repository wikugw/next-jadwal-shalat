// ============================================================
// Service Worker — jadwal-shalat
// Responsibilities:
//   1. Cache app shell on install (offline-first)
//   2. Cache API responses with stale-while-revalidate
//
// NOTE: Prayer reminder scheduling is done in the main thread (usePWA.ts).
// The main thread calls reg.showNotification() directly when a timer fires,
// which wakes this SW to display it — no SW-side setTimeout needed.
// ============================================================

const SHELL_CACHE = 'shell-v2';
const JADWAL_CACHE = 'jadwal-v2';

const SHELL_URLS = ['/', '/manifest.json'];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== JADWAL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/shalat/jadwal')) {
    event.respondWith(jadwalStrategy(event.request));
    return;
  }

  if (
    url.pathname.startsWith('/api/shalat/provinsi') ||
    url.pathname.startsWith('/api/shalat/kabkota')
  ) {
    event.respondWith(listStrategy(event.request));
    return;
  }

  if (
    url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || url.pathname.startsWith('/_next/'))
  ) {
    event.respondWith(shellStrategy(event.request));
    return;
  }
});

// ── POST cache key helper ─────────────────────────────────────
// Cache API only natively supports GET. For POST routes we build a
// synthetic GET key from URL + body so we can store/retrieve responses.
async function postCacheKey(request) {
  const body = await request.clone().text();
  return new Request(request.url + '?_body=' + encodeURIComponent(body), { method: 'GET' });
}

// ── Strategy: jadwal (stale-while-revalidate) ─────────────────
async function jadwalStrategy(request) {
  const cache = await caches.open(JADWAL_CACHE);
  const cacheKey = await postCacheKey(request);
  const cached = await cache.match(cacheKey);

  const networkPromise = fetchAndCachePost(request.clone(), cache, cacheKey);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  try {
    return await networkPromise;
  } catch {
    return new Response(
      JSON.stringify({ code: 503, message: 'Offline — data tidak tersedia' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Strategy: province/city lists (cache-first) ───────────────
async function listStrategy(request) {
  const cache = await caches.open(JADWAL_CACHE);

  if (request.method === 'POST') {
    const cacheKey = await postCacheKey(request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
      return await fetchAndCachePost(request, cache, cacheKey);
    } catch {
      return new Response(JSON.stringify({ code: 503 }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    return await fetchAndCacheGet(request, cache);
  } catch {
    return new Response(JSON.stringify({ code: 503 }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Strategy: shell (network-first, cache fallback) ───────────
async function shellStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || new Response('Offline', { status: 503 });
  }
}

async function fetchAndCacheGet(request, cache) {
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function fetchAndCachePost(request, cache, cacheKey) {
  const response = await fetch(request);
  if (response.ok) cache.put(cacheKey, response.clone());
  return response;
}

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
