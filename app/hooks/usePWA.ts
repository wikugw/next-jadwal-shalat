'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Prayer {
  name: string;
  label: string;
  time: string;
}

// Register SW once on mount
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }, []);
}

// Schedule prayer reminders via the SW
export function usePrayerReminders() {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      permissionRef.current = Notification.permission;
    }
  }, []);

  const requestAndSchedule = useCallback(
    async (prayers: Prayer[], dateStr: string) => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      // Request permission if not yet granted
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        permissionRef.current = result;
      }

      if (Notification.permission !== 'granted') return;

      const sw = await navigator.serviceWorker.ready;
      sw.active?.postMessage({
        type: 'SCHEDULE_REMINDERS',
        prayers,
        date: dateStr,
      });
    },
    []
  );

  const clearReminders = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    const sw = await navigator.serviceWorker.ready;
    sw.active?.postMessage({ type: 'CLEAR_REMINDERS' });
  }, []);

  return { requestAndSchedule, clearReminders, permission: permissionRef.current };
}
