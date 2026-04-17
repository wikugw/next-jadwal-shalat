'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Prayer {
  name: string;
  label: string;
  time: string;
}

// ── Register SW once on mount ────────────────────────────────
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }, []);
}

// ── Prayer reminders ─────────────────────────────────────────
// Key insight: setTimeout in a SW can be killed by the browser at any time.
// The reliable pattern is to keep timers in the MAIN THREAD (long-lived tab),
// and only call sw.showNotification() when the timer fires — that wakes the SW.
export function usePrayerReminders() {
  // Map of prayer name → timer id
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearReminders = useCallback(() => {
    for (const id of timersRef.current.values()) clearTimeout(id);
    timersRef.current.clear();
  }, []);

  const requestAndSchedule = useCallback(
    async (prayers: Prayer[], dateStr: string) => {
      if (!('Notification' in window)) return;

      // Ask for permission if needed
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission !== 'granted') return;

      // Clear existing timers before rescheduling
      clearReminders();

      const LEAD_MS = 15 * 60 * 1000; // 15 min before

      for (const { name, label, time } of prayers) {
        const [h, m] = time.split(':').map(Number);
        const prayerDate = new Date(dateStr);
        prayerDate.setHours(h, m, 0, 0);

        const delay = prayerDate.getTime() - LEAD_MS - Date.now();
        if (delay < 0) continue; // already past

        const id = setTimeout(async () => {
          // Try SW notification first (shows even if tab is backgrounded)
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.ready;
              await reg.showNotification(`🕌 ${label} dalam 15 menit`, {
                body: `Waktu ${label} pukul ${time}`,
                icon: '/icons/icon-192.png',
                badge: '/icons/badge-72.png',
                tag: name,
                renotify: true,
                silent: false,
              });
              return;
            } catch {
              // SW notification failed, fall through to Notification API
            }
          }
          // Fallback: direct Notification API (works when tab is in foreground)
          new Notification(`🕌 ${label} dalam 15 menit`, {
            body: `Waktu ${label} pukul ${time}`,
            icon: '/icons/icon-192.png',
            tag: name,
            silent: false,
          });
        }, delay);

        timersRef.current.set(name, id);
      }
    },
    [clearReminders]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => clearReminders();
  }, [clearReminders]);

  return { requestAndSchedule, clearReminders };
}
