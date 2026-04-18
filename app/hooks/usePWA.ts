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
        .then((reg) => console.log('[SW] registered, scope:', reg.scope))
        .catch((err) => console.warn('[SW] registration failed:', err));
    }
  }, []);
}

// ── Prayer reminders ─────────────────────────────────────────
export function usePrayerReminders() {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Request notification permission and return whether it was granted
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  const notify = useCallback(async (title: string, body: string, tag: string) => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          tag,
          renotify: true,
        });
        return;
      }
    } catch (e) {
      console.warn('[Notif] SW notification failed:', e);
    }
    new Notification(title, { body, icon: '/icons/icon-192.png', tag });
  }, []);

  // Fire a test notification immediately
  const testNotification = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      console.warn('[Notif] Permission not granted');
      return;
    }
    console.log('[Notif] Firing test notification…');
    await notify('🕌 Test Notifikasi', 'Pengingat shalat berfungsi!', `test-${Date.now()}`);
    console.log('[Notif] Test done');
  }, [requestPermission, notify]);

  const clearReminders = useCallback(() => {
    for (const id of timersRef.current.values()) clearTimeout(id);
    timersRef.current.clear();
    console.log('[Notif] All reminders cleared');
  }, []);

  const scheduleAll = useCallback(
    async (prayers: Prayer[], dateStr: string) => {
      const granted = await requestPermission();
      if (!granted) {
        console.warn('[Notif] Permission not granted, skipping schedule');
        return;
      }

      clearReminders();

      const LEAD_MS = 15 * 60 * 1000;
      let scheduled = 0;

      for (const { name, label, time } of prayers) {
        const [h, m] = time.split(':').map(Number);
        const prayerDate = new Date(dateStr);
        prayerDate.setHours(h, m, 0, 0);

        const delayReminder = prayerDate.getTime() - LEAD_MS - Date.now();
        const delayOnTime = prayerDate.getTime() - Date.now();

        // 15-min reminder
        if (delayReminder >= 0) {
          const id = setTimeout(async () => {
            console.log(`[Notif] Reminder firing for ${name}`);
            await notify(`🕌 ${label} dalam 15 menit`, `Waktu ${label} pukul ${time}`, name + '-reminder');
          }, delayReminder);
          timersRef.current.set(name + '-reminder', id);
          scheduled++;
          console.log(`[Notif] Reminder ${name} in ${Math.round(delayReminder / 60000)} min`);
        }

        // On-time notification
        if (delayOnTime >= 0) {
          const id = setTimeout(async () => {
            console.log(`[Notif] On-time firing for ${name}`);
            await notify(`🕌 Waktu ${label} telah tiba`, `Saatnya shalat ${label} — ${time}`, name + '-ontime');
          }, delayOnTime);
          timersRef.current.set(name + '-ontime', id);
          scheduled++;
          console.log(`[Notif] On-time ${name} in ${Math.round(delayOnTime / 60000)} min`);
        }
      }

      console.log(`[Notif] ${scheduled} reminders scheduled for ${dateStr}`);
    },
    [requestPermission, clearReminders, notify]
  );

  useEffect(() => {
    return () => clearReminders();
  }, [clearReminders]);

  return { requestPermission, scheduleAll, clearReminders, testNotification };
}
