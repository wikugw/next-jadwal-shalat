'use client';

interface JadwalItem {
  tanggal: number;
  tanggal_lengkap: string;
  hari: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
}

interface Props {
  schedule: JadwalItem;
  now: Date;
  remindersEnabled?: boolean;
}

const PRAYERS = [
  { key: 'imsak', label: 'Imsak', icon: '🌙' },
  { key: 'subuh', label: 'Subuh', icon: '🌅' },
  { key: 'terbit', label: 'Terbit', icon: '☀️' },
  { key: 'dhuha', label: 'Dhuha', icon: '🌤' },
  { key: 'dzuhur', label: 'Dzuhur', icon: '☀️' },
  { key: 'ashar', label: 'Ashar', icon: '🌇' },
  { key: 'maghrib', label: 'Maghrib', icon: '🌆' },
  { key: 'isya', label: 'Isya', icon: '🌙' },
] as const;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function findNextPrayer(schedule: JadwalItem, now: Date): string | null {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (const p of PRAYERS) {
    const pMin = timeToMinutes(schedule[p.key]);
    if (pMin > currentMinutes) return p.key;
  }
  return null;
}

function findCurrentPrayer(schedule: JadwalItem, now: Date): string | null {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let lastPassed: string | null = null;
  for (const p of PRAYERS) {
    const pMin = timeToMinutes(schedule[p.key]);
    if (pMin <= currentMinutes) lastPassed = p.key;
  }
  return lastPassed;
}

export default function PrayerCard({ schedule, now }: Props) {
  const nextKey = findNextPrayer(schedule, now);
  const currentKey = findCurrentPrayer(schedule, now);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const nextPrayer = PRAYERS.find((p) => p.key === nextKey);
  const nextTime = nextKey ? schedule[nextKey] : null;
  let countdown = '';
  if (nextTime) {
    const diff = timeToMinutes(nextTime) - currentMinutes;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    countdown = h > 0 ? `${h} jam ${m} menit lagi` : `${m} menit lagi`;
  }

  return (
    <div className="space-y-4">
      {/* Time & date */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900/40 to-emerald-950/20 border border-emerald-800/40 p-5">
        <p className="text-4xl font-bold tabular-nums tracking-tight">{timeStr}</p>
        <p className="text-zinc-400 text-sm mt-1 capitalize">{dateStr}</p>
        {nextPrayer && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-base">{nextPrayer.icon}</span>
            <div>
              <p className="text-xs text-zinc-400">Waktu berikutnya</p>
              <p className="text-sm font-semibold text-emerald-300">
                {nextPrayer.label} · {nextTime} <span className="font-normal text-zinc-400">({countdown})</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Prayer list */}
      <div className="rounded-2xl bg-[#161b22] border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
        {PRAYERS.map((p) => {
          const isNext = p.key === nextKey;
          const isCurrent = p.key === currentKey && !isNext;
          const isPast = timeToMinutes(schedule[p.key]) < currentMinutes && !isNext;

          return (
            <div
              key={p.key}
              className={`flex items-center justify-between px-5 py-3.5 transition-colors
                ${isNext ? 'bg-emerald-900/30' : ''}
              `}
            >
              <div className="flex items-center gap-3">
                <span className={`text-base ${isPast && !isCurrent ? 'opacity-30' : ''}`}>
                  {p.icon}
                </span>
                <span
                  className={`text-sm font-medium
                    ${isNext ? 'text-emerald-300' : ''}
                    ${isPast && !isCurrent ? 'text-zinc-600' : 'text-zinc-200'}
                  `}
                >
                  {p.label}
                </span>
                {isNext && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    berikutnya
                  </span>
                )}
              </div>
              <span
                className={`text-sm tabular-nums font-semibold
                  ${isNext ? 'text-emerald-300' : ''}
                  ${isPast && !isCurrent ? 'text-zinc-600' : 'text-zinc-300'}
                `}
              >
                {schedule[p.key]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
