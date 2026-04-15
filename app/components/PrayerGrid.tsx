'use client';

import { useState } from 'react';

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

interface PrayerData {
  provinsi: string;
  kabkota: string;
  bulan: number;
  tahun: number;
  bulan_nama: string;
  jadwal: JadwalItem[];
}

interface Props {
  data: PrayerData;
  today: string;
}

const MAIN_PRAYERS = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as const;

export default function PrayerGrid({ data, today }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
        Jadwal Bulan {data.bulan_nama} {data.tahun}
      </p>

      <div className="rounded-2xl bg-[#161b22] border border-zinc-800 overflow-hidden divide-y divide-zinc-800/60">
        {data.jadwal.map((j) => {
          const isToday = j.tanggal_lengkap === today;
          const isPast = j.tanggal_lengkap < today;
          const isOpen = expanded === j.tanggal;

          return (
            <div key={j.tanggal}>
              <button
                onClick={() => setExpanded(isOpen ? null : j.tanggal)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
                  ${isToday ? 'bg-emerald-900/20' : ''}
                  ${isPast ? 'opacity-40' : ''}
                  active:bg-zinc-800/50
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 text-center text-sm font-bold tabular-nums
                    ${isToday ? 'text-emerald-400' : 'text-zinc-400'}
                  `}>
                    {j.tanggal}
                  </div>
                  <div>
                    <p className={`text-sm font-medium leading-tight
                      ${isToday ? 'text-white' : 'text-zinc-300'}
                    `}>
                      {j.hari}
                      {isToday && (
                        <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          Hari ini
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-600 leading-tight mt-0.5">
                      {j.subuh} · {j.dzuhur} · {j.ashar} · {j.maghrib} · {j.isya}
                    </p>
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-zinc-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="bg-[#0d1117] px-4 py-3 grid grid-cols-4 gap-2 border-t border-zinc-800/60">
                  {(['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'] as const).map((key) => (
                    <div key={key} className="text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{key}</p>
                      <p className="text-xs font-semibold text-zinc-200 tabular-nums mt-0.5">{j[key]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
