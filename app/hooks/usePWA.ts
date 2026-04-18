'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Prayer {
  name: string;
  label: string;
  time: string;
}

// Extend NotificationOptions to include fields not yet in all TS lib versions
interface FullNotificationOptions extends NotificationOptions {
  renotify?: boolean;
  silent?: boolean;
}

// ── Register SW + suppress PWA install banner ────────────────
export function useServiceWorker() {
  useEffect(() => {
    // Intercept the "add to home screen" / "tap to copy URL" banner.
    // Calling preventDefault() stops Chrome from showing it automatically.
    const handler = (e: Event) => e.preventDefault();
    window.addEventListener('beforeinstallprompt', handler);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed:', err));
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
}

// ── Prayer reminders ─────────────────────────────────────────
export function usePrayerReminders() {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearReminders = useCallback(() => {
    for (const id of timersRef.current.values()) clearTimeout(id);
    timersRef.current.clear();
  }, []);

  // Call this when the user explicitly toggles ON — requests permission immediately.
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  const scheduleAll = useCallback(
    (prayers: Prayer[], dateStr: string) => {
      if (Notification.permission !== 'granted') return;

      clearReminders();

      const LEAD_MS = 15 * 60 * 1000; // 15 min before

      for (const { name, label, time } of prayers) {
        const [h, m] = time.split(':').map(Number);
        const prayerDate = new Date(dateStr);
        prayerDate.setHours(h, m, 0, 0);

        const delay = prayerDate.getTime() - LEAD_MS - Date.now();
        if (delay < 0) continue;

        const id = setTimeout(async () => {
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.ready;
              const swOpts: FullNotificationOptions = {
                body: `Waktu ${label} pukul ${time}`,
                icon: '/icons/icon-192',
                badge: '/icons/badge-72',
                tag: name,
                renotify: true,
                silent: false,
              };
              await reg.showNotification(`🕌 ${label} dalam 15 menit`, swOpts);
              return;
            } catch {
              // fall through
            }
          }
          const fallbackOpts: FullNotificationOptions = {
            body: `Waktu ${label} pukul ${time}`,
            icon: '/icons/icon-192',
            tag: name,
            silent: false,
          };
          new Notification(`🕌 ${label} dalam 15 menit`, fallbackOpts);
        }, delay);

        timersRef.current.set(name, id);
      }
    },
    [clearReminders]
  );

  useEffect(() => {
    return () => clearReminders();
  }, [clearReminders]);

  return { requestPermission, scheduleAll, clearReminders };
}
