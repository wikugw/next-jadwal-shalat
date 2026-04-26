'use client';

import { useEffect, useCallback } from 'react';

export interface ScheduledPrayer {
  name: string;
  label: string;
  time: string;    // "HH:MM"
  dateStr: string; // "YYYY-MM-DD"
}

const STORAGE_KEY = 'prayer_schedule';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

// ── Register SW ──────────────────────────────────────────────
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] registered');
          reg.active?.postMessage({ type: 'START_TICKER' });
        })
        .catch((err) => console.warn('[SW] registration failed:', err));
    }
  }, []);
}

// ── Prayer reminders ─────────────────────────────────────────
export function usePrayerReminders() {
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  const saveSchedule = useCallback((prayers: ScheduledPrayer[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prayers));
    } catch (e) {
      console.warn('[Notif] Failed to save schedule:', e);
    }
  }, []);

  const clearSchedule = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);

    // Unsubscribe from server push
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
          console.log('[Push] Unsubscribed from server push');
        }
        reg.active?.postMessage({ type: 'CLEAR_FIRED' });
      } catch (e) {
        console.warn('[Push] Unsubscribe failed:', e);
      }
    }
  }, []);

  const scheduleAll = useCallback(
    async (
      prayers: Omit<ScheduledPrayer, 'dateStr'>[],
      dateStr: string,
      location?: { provinsi: string; kabkota: string }
    ) => {
      const granted = await requestPermission();
      if (!granted) return;

      const full: ScheduledPrayer[] = prayers.map((p) => ({ ...p, dateStr }));

      // 1. Save to localStorage (SW ticker fallback when app is open)
      saveSchedule(full);

      // 2. Server push subscription (true background notifications)
      if ('serviceWorker' in navigator && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        try {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();

          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(
                process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
              ),
            });
            console.log('[Push] New push subscription created');
          }

          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              schedule: full,
              kabkota: location?.kabkota ?? null,
              provinsi: location?.provinsi ?? null,
              tzOffset: new Date().getTimezoneOffset(),
            }),
          });

          if (!res.ok) throw new Error(await res.text());
          console.log('[Push] Subscribed to server push ✓');
        } catch (e) {
          console.warn('[Push] Server push failed, SW ticker is fallback:', e);
        }
      }

      // 3. Ping SW ticker to check schedule immediately
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'RELOAD_SCHEDULE' });
      }
    },
    [requestPermission, saveSchedule]
  );

  // Re-ping SW on every app focus/re-open
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({ type: 'RELOAD_SCHEDULE' });
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Test: fire a notification immediately
  const testNotification = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) return;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🕌 Test Notifikasi', {
        body: 'Pengingat shalat berfungsi!',
        icon: '/icons/icon-192.png',
        tag: `test-${Date.now()}`,
      });
    }
  }, [requestPermission]);

  return { requestPermission, scheduleAll, clearSchedule, testNotification };
}
