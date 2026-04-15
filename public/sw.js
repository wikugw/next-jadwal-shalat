// ============================================================
// Service Worker — jadwal-shalat
// Responsibilities:
//   1. Cache app shell on install (offline-first)
//   2. Cache API responses (jadwal) with stale-while-revalidate
//   3. Show prayer reminder notifications
// ============================================================

const SHELL_CACHE = 'shell-v1';
const JADWAL_CACHE = 'jadwal-v1';

// App shell: static assets that make the app load offline
const SHELL_URLS = [
  '/',
  '/manifest.json',
];

// ── Install: precache shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────
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

// ── Fetch: intercept network requests ───────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API proxy routes: cache-first with background revalidation
  if (url.pathname.startsWith('/api/shalat/jadwal')) {
    event.respondWith(jadwalStrategy(event.request));
    return;
  }

  // Province/city lists: cache-first (rarely changes)
  if (
    url.pathname.startsWith('/api/shalat/provinsi') ||
    url.pathname.startsWith('/api/shalat/kabkota')
  ) {
    event.respondWith(listStrategy(event.request));
    return;
  }

  // App shell: network-first, fall back to cache
  if (
    url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || url.pathname.startsWith('/_next/'))
  ) {
    event.respondWith(shellStrategy(event.request));
    return;
  }
});

// ── Strategy: jadwal (stale-while-revalidate) ────────────────
async function jadwalStrategy(request) {
  const cache = await caches.open(JADWAL_CACHE);
  const cached = await cache.match(request);

  // Clone before consuming
  const networkPromise = fetchAndCache(request.clone(), cache);

  if (cached) {
    // Serve cached, refresh in background
    networkPromise.catch(() => {}); // silent bg failure
    return cached;
  }

  // No cache: must wait for network
  try {
    return await networkPromise;
  } catch {
    return new Response(
      JSON.stringify({ code: 503, message: 'Offline — data tidak tersedia' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Strategy: province/city lists (cache-first, 7 days TTL) ──
async function listStrategy(request) {
  const cache = await caches.open(JADWAL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    return await fetchAndCache(request, cache);
  } catch {
    return new Response(
      JSON.stringify({ code: 503, message: 'Offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Strategy: shell (network-first, cache fallback) ──────────
async function shellStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ||
      new Response('Offline', { status: 503 });
  }
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

// ── Prayer reminder notifications ────────────────────────────
// The app sends a 'SCHEDULE_REMINDERS' message with today's schedule.
// We store active timers here (keyed by prayer name).
const timers = new Map();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_REMINDERS') {
    scheduleReminders(event.data.prayers, event.data.date);
  }
  if (event.data?.type === 'CLEAR_REMINDERS') {
    clearAllTimers();
  }
});

function clearAllTimers() {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}

function scheduleReminders(prayers, dateStr) {
  clearAllTimers();

  const now = Date.now();
  const LEAD_MS = 15 * 60 * 1000; // 15 minutes before

  for (const { name, label, time } of prayers) {
    const [h, m] = time.split(':').map(Number);
    const prayerDate = new Date(dateStr);
    prayerDate.setHours(h, m, 0, 0);

    const notifyAt = prayerDate.getTime() - LEAD_MS;
    const delay = notifyAt - now;

    if (delay < 0) continue; // already passed

    const id = setTimeout(async () => {
      try {
        await self.registration.showNotification(`🕌 ${label} dalam 15 menit`, {
          body: `Waktu ${label} pukul ${time}`,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          tag: name,
          renotify: true,
          silent: false,
          data: { prayer: name },
        });
      } catch (e) {
        console.warn('Notification failed:', e);
      }
    }, delay);

    timers.set(name, id);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
