'use client';

interface Props {
  enabled: boolean;
  onToggle: (val: boolean) => void;
}

export default function ReminderToggle({ enabled, onToggle }: Props) {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  if (!supported) return null;

  return (
    <button
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Matikan pengingat' : 'Aktifkan pengingat 15 menit sebelum waktu shalat'}
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-colors text-xs font-medium
        ${enabled
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
          : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
        }`}
    >
      <span className="text-base leading-none">{enabled ? '🔔' : '🔕'}</span>
      <span>{enabled ? 'On' : 'Off'}</span>
    </button>
  );
}
