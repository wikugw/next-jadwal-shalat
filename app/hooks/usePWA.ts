'use client';

import { useEffect, useCallback } from 'react';

export interface ScheduledPrayer {
  name: string;
  label: string;
  time: string;       // "HH:MM"
  dateStr: string;    // "YYYY-MM-DD"
}

const STORAGE_KEY = 'prayer_schedule';

// ── Register SW ──────────────────────────────────────────────
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] registered');
          // Tell SW to start its ticker
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

  // Save schedule to localStorage so SW can read it
  const saveSchedule = useCallback((prayers: ScheduledPrayer[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prayers));
      console.log('[Notif] Schedule saved to localStorage:', prayers.length, 'prayers');
    } catch (e) {
      console.warn('[Notif] Failed to save schedule:', e);
    }
  }, []);

  const clearSchedule = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Notif] Schedule cleared');
    // Tell SW to clear its fired-set too
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({ type: 'CLEAR_FIRED' });
      });
    }
  }, []);

  const scheduleAll = useCallback(
    async (prayers: Omit<ScheduledPrayer, 'dateStr'>[], dateStr: string) => {
      const granted = await requestPermission();
      if (!granted) return;

      const full: ScheduledPrayer[] = prayers.map((p) => ({ ...p, dateStr }));
      saveSchedule(full);

      // Ping SW to re-read schedule now
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'RELOAD_SCHEDULE' });
      }
    },
    [requestPermission, saveSchedule]
  );

  // Re-ping SW every time the page becomes visible (app re-opened)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.active?.postMessage({ type: 'RELOAD_SCHEDULE' });
          console.log('[Notif] Page visible, pinged SW to reload schedule');
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Test: fire immediately
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
