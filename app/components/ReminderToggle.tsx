'use client';

import { useState, useEffect } from 'react';

interface Props {
  enabled: boolean;
  onToggle: (val: boolean) => Promise<boolean>; // returns false if permission denied
}

export default function ReminderToggle({ enabled, onToggle }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setDenied(Notification.permission === 'denied');
    }
  }, []);

  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  if (!supported) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleClick = async () => {
    if (denied) {
      showToast('Izin notifikasi ditolak. Aktifkan di pengaturan browser.');
      return;
    }
    const next = !enabled;
    const granted = await onToggle(next);
    if (next && !granted) {
      setDenied(true);
      showToast('Izin notifikasi ditolak. Aktifkan di pengaturan browser.');
    } else if (next) {
      showToast('🔔 Pengingat shalat aktif — 15 menit sebelum waktu');
    } else {
      showToast('🔕 Pengingat shalat dimatikan');
    }
  };

  return (
    <div className="relative flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        title={enabled ? 'Matikan pengingat' : 'Aktifkan pengingat 15 menit sebelum waktu shalat'}
        className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-colors text-xs font-medium
          ${denied
            ? 'bg-zinc-800/60 border-zinc-700 text-zinc-600 cursor-not-allowed'
            : enabled
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
          }`}
      >
        <span className="text-base leading-none">
          {denied ? '🚫' : enabled ? '🔔' : '🔕'}
        </span>
        <span>{denied ? 'Ditolak' : enabled ? 'On' : 'Off'}</span>
      </button>

      {/* Toast */}
      {toast && (
        <div className="absolute top-full mt-2 right-0 z-50 w-64 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-xl px-4 py-3 shadow-xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
