// ============================================================
// Service Worker — jadwal-shalat
//
// Notification strategy:
//   The main thread saves today's prayer schedule to localStorage.
//   This SW runs a 30-second ticker. On each tick it asks the active
//   client (tab/PWA window) to send back the stored schedule, then
//   checks which prayers need a notification now.
//
//   This is more reliable than main-thread setTimeout because:
//   - The SW can be woken by the browser even when the PWA is in bg
//   - On re-open, visibilitychange pings SW to re-read the schedule
//   - We track already-fired notifications to avoid duplicates
// ============================================================

const SHELL_CACHE = 'shell-v2';
const JADWAL_CACHE = 'jadwal-v2';
const SHELL_URLS = ['/', '/manifest.json'];
const LEAD_MINUTES = 15;
const TICK_INTERVAL_MS = 30_000; // 30 seconds

// Track which notifications have already been shown today
// Key: "subuh-reminder" | "subuh-ontime" — cleared on CLEAR_FIRED message
const firedSet = new Set();
let tickerInterval = null;

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
  startTicker();
});

// ── Messages from main thread ─────────────────────────────────
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'START_TICKER') {
    startTicker();
  }

  if (type === 'RELOAD_SCHEDULE') {
    // Run a tick immediately when app re-opens
    runTick();
  }

  if (type === 'CLEAR_FIRED') {
    firedSet.clear();
    console.log('[SW] Fired set cleared');
  }

  // Client responding to our schedule request
  if (type === 'SCHEDULE_DATA') {
    processSchedule(event.data.prayers);
  }
});

// ── Ticker ────────────────────────────────────────────────────
function startTicker() {
  if (tickerInterval) return; // already running
  console.log('[SW] Ticker started');
  tickerInterval = setInterval(runTick, TICK_INTERVAL_MS);
  runTick(); // run immediately on start
}

async function runTick() {
  // Ask a connected client for the schedule stored in localStorage
  const allClients = await self.clients.matchAll({ type: 'window' });
  if (allClients.length === 0) {
    // No client open — can't read localStorage.
    // The next visibilitychange ping will re-trigger when app opens.
    return;
  }
  // Ask the first available client
  allClients[0].postMessage({ type: 'GET_SCHEDULE' });
}

// ── Schedule processing ───────────────────────────────────────
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function processSchedule(prayers) {
  if (!prayers || prayers.length === 0) return;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const { name, label, time, dateStr } of prayers) {
    // Only process today's schedule
    if (dateStr !== todayStr) continue;

    const prayerMinutes = timeToMinutes(time);

    // Check reminder (15 min before): fire when within [prayerTime-15, prayerTime-14]
    const reminderKey = `${name}-reminder-${todayStr}`;
    const reminderMinute = prayerMinutes - LEAD_MINUTES;
    if (
      !firedSet.has(reminderKey) &&
      nowMinutes >= reminderMinute &&
      nowMinutes < reminderMinute + 1
    ) {
      firedSet.add(reminderKey);
      console.log(`[SW] Firing reminder for ${name}`);
      await showNotif(
        `🕌 ${label} dalam 15 menit`,
        `Waktu ${label} pukul ${time}`,
        reminderKey
      );
    }

    // Check on-time: fire when within [prayerTime, prayerTime+1)
    const onTimeKey = `${name}-ontime-${todayStr}`;
    if (
      !firedSet.has(onTimeKey) &&
      nowMinutes >= prayerMinutes &&
      nowMinutes < prayerMinutes + 1
    ) {
      firedSet.add(onTimeKey);
      console.log(`[SW] Firing on-time for ${name}`);
      await showNotif(
        `🕌 Waktu ${label} telah tiba`,
        `Saatnya shalat ${label} — ${time}`,
        onTimeKey
      );
    }
  }
}

async function showNotif(title, body, tag) {
  try {
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag,
      renotify: true,
    });
  } catch (e) {
    console.warn('[SW] showNotification failed:', e);
  }
}

// ── Fetch (caching) ───────────────────────────────────────────
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

async function postCacheKey(request) {
  const body = await request.clone().text();
  return new Request(request.url + '?_body=' + encodeURIComponent(body), { method: 'GET' });
}

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

async function listStrategy(request) {
  const cache = await caches.open(JADWAL_CACHE);
  if (request.method === 'POST') {
    const cacheKey = await postCacheKey(request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try { return await fetchAndCachePost(request, cache, cacheKey); }
    catch { return new Response(JSON.stringify({ code: 503 }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  }
  const cached = await cache.match(request);
  if (cached) return cached;
  try { return await fetchAndCacheGet(request, cache); }
  catch { return new Response(JSON.stringify({ code: 503 }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
}

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

// ── Push (from server via Vercel Cron) ──────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, tag } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag,
      renotify: true,
    })
  );
});

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
