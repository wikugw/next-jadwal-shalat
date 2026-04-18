'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import LocationPicker from './LocationPicker';
import PrayerCard from './PrayerCard';
import PrayerGrid from './PrayerGrid';
import ReminderToggle from './ReminderToggle';
import OfflineBanner from './OfflineBanner';
import { useServiceWorker, usePrayerReminders } from '../hooks/usePWA';

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

type LocationState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'ready'; provinsi: string; kabkota: string }
  | { status: 'denied' }
  | { status: 'manual'; provinsi: string; kabkota: string };

// ISO 3166-2 code → equran.id province name
const ISO_TO_PROVINSI: Record<string, string> = {
  'ID-AC': 'Aceh',
  'ID-SU': 'Sumatera Utara',
  'ID-SB': 'Sumatera Barat',
  'ID-RI': 'Riau',
  'ID-KR': 'Kepulauan Riau',
  'ID-JA': 'Jambi',
  'ID-SS': 'Sumatera Selatan',
  'ID-BB': 'Kepulauan Bangka Belitung',
  'ID-BE': 'Bengkulu',
  'ID-LA': 'Lampung',
  'ID-JK': 'DKI Jakarta',
  'ID-JB': 'Jawa Barat',
  'ID-BT': 'Banten',
  'ID-JT': 'Jawa Tengah',
  'ID-YO': 'DI Yogyakarta',
  'ID-JI': 'Jawa Timur',
  'ID-BA': 'Bali',
  'ID-NB': 'Nusa Tenggara Barat',
  'ID-NT': 'Nusa Tenggara Timur',
  'ID-KB': 'Kalimantan Barat',
  'ID-KT': 'Kalimantan Tengah',
  'ID-KS': 'Kalimantan Selatan',
  'ID-KI': 'Kalimantan Timur',
  'ID-KU': 'Kalimantan Utara',
  'ID-SA': 'Sulawesi Utara',
  'ID-GO': 'Gorontalo',
  'ID-ST': 'Sulawesi Tengah',
  'ID-SR': 'Sulawesi Barat',
  'ID-SN': 'Sulawesi Selatan',
  'ID-SG': 'Sulawesi Tenggara',
  'ID-MA': 'Maluku',
  'ID-MU': 'Maluku Utara',
  'ID-PA': 'Papua',
  'ID-PB': 'Papua Barat',
  'ID-PE': 'Papua Pegunungan',
  'ID-PS': 'Papua Selatan',
  'ID-PT': 'Papua Tengah',
  'ID-SW': 'Papua Barat Daya',
};

function extractProvinceFromNominatim(addr: Record<string, string>): string {
  // 1. ISO 3166-2 lvl4 is the most reliable for Indonesia (e.g. ID-JK → DKI Jakarta)
  const isoCode = addr['ISO3166-2-lvl4'];
  if (isoCode && ISO_TO_PROVINSI[isoCode]) return ISO_TO_PROVINSI[isoCode];
  // 2. state field, but avoid generic "Jawa" region bleed-through
  if (addr.state && !['jawa', 'java'].includes(addr.state.toLowerCase())) return addr.state;
  return addr.province || addr.state || '';
}

function extractCityFromNominatim(addr: Record<string, string>): string {
  // DKI Jakarta: city gives sub-city (e.g. "Jakarta Utara"), but API uses "Kota Jakarta"
  if (addr['ISO3166-2-lvl4'] === 'ID-JK') return 'Kota Jakarta';
  return addr.city || addr.regency || addr.county || addr.town || addr.municipality || '';
}

function fuzzyMatch(input: string, candidates: string[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[.\-]/g, '').replace(/\s+/g, ' ').trim();
  const normInput = norm(input);

  // exact
  const exact = candidates.find((c) => norm(c) === normInput);
  if (exact) return exact;

  // contains
  const contains = candidates.find(
    (c) => norm(c).includes(normInput) || normInput.includes(norm(c))
  );
  if (contains) return contains;

  // word overlap
  const inputWords = normInput.split(' ');
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const cWords = norm(c).split(' ');
    const overlap = inputWords.filter((w) => cWords.includes(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}

const PRAYER_LABELS: Record<string, string> = {
  imsak: 'Imsak',
  subuh: 'Subuh',
  terbit: 'Terbit',
  dhuha: 'Dhuha',
  dzuhur: 'Dzuhur',
  ashar: 'Ashar',
  maghrib: 'Maghrib',
  isya: 'Isya',
};

// ── localStorage helpers ────────────────────────────────────
const LS_LOCATION = 'jadwal_location';
const LS_REMINDERS = 'jadwal_reminders';

function loadSavedLocation(): { provinsi: string; kabkota: string } | null {
  try {
    const raw = localStorage.getItem(LS_LOCATION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocation(provinsi: string, kabkota: string) {
  try {
    localStorage.setItem(LS_LOCATION, JSON.stringify({ provinsi, kabkota }));
  } catch {}
}

function loadSavedReminders(): boolean {
  try {
    return localStorage.getItem(LS_REMINDERS) === 'true';
  } catch {
    return false;
  }
}

function saveReminders(enabled: boolean) {
  try {
    localStorage.setItem(LS_REMINDERS, String(enabled));
  } catch {}
}

export default function PrayerApp() {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  // Track whether we've already bootstrapped from localStorage
  const bootstrapped = useRef(false);

  useServiceWorker();
  const { requestPermission, scheduleAll, clearReminders } = usePrayerReminders();

  // Tick every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchSchedule = useCallback(async (provinsi: string, kabkota: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shalat/jadwal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provinsi, kabkota }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setPrayerData(json.data);
      } else if (json.code === 503) {
        setError('Kamu sedang offline. Menampilkan data tersimpan.');
      } else {
        setError('Gagal mengambil jadwal shalat.');
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, []);

  const detectLocation = useCallback(async () => {
    setLocation({ status: 'detecting' });
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Reverse geocode
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'id' } }
          );
          const geo = await geoRes.json();
          const addr = geo.address || {};

          const rawProvince = extractProvinceFromNominatim(addr);
          const rawCity = extractCityFromNominatim(addr);

          // Fetch available provinces
          const provRes = await fetch('/api/shalat/provinsi');
          const provJson = await provRes.json();
          const provinces: string[] = provJson.data || [];

          const matchedProv = fuzzyMatch(rawProvince, provinces);
          if (!matchedProv) {
            setLocation({ status: 'denied' });
            setError('Lokasi tidak dapat dikenali. Pilih manual.');
            return;
          }

          // Fetch cities for matched province
          const kotaRes = await fetch('/api/shalat/kabkota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provinsi: matchedProv }),
          });
          const kotaJson = await kotaRes.json();
          const cities: string[] = kotaJson.data || [];

          const matchedCity = fuzzyMatch(rawCity, cities);
          if (!matchedCity) {
            // Fall back to first city in province
            const fallback = cities[0];
            setLocation({ status: 'ready', provinsi: matchedProv, kabkota: fallback });
            saveLocation(matchedProv, fallback);
            fetchSchedule(matchedProv, fallback);
            return;
          }

          setLocation({ status: 'ready', provinsi: matchedProv, kabkota: matchedCity });
          saveLocation(matchedProv, matchedCity);
          fetchSchedule(matchedProv, matchedCity);
        } catch {
          setLocation({ status: 'denied' });
          setError('Gagal mendeteksi lokasi. Pilih manual.');
        }
      },
      () => {
        setLocation({ status: 'denied' });
      }
    );
  }, [fetchSchedule]);

  // Bootstrap: restore persisted location + reminders, skip detection if we have a saved location
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const savedReminders = loadSavedReminders();
    if (savedReminders) setRemindersEnabled(true);

    const saved = loadSavedLocation();
    if (saved) {
      setLocation({ status: 'ready', provinsi: saved.provinsi, kabkota: saved.kabkota });
      fetchSchedule(saved.provinsi, saved.kabkota);
    } else {
      detectLocation();
    }
  }, [detectLocation, fetchSchedule]);

  const handleManualSelect = (provinsi: string, kabkota: string) => {
    setLocation({ status: 'manual', provinsi, kabkota });
    saveLocation(provinsi, kabkota);
    fetchSchedule(provinsi, kabkota);
  };

  // Persist reminder preference whenever it changes (skip the initial render)
  const isFirstReminderRender = useRef(true);
  useEffect(() => {
    if (isFirstReminderRender.current) {
      isFirstReminderRender.current = false;
      return;
    }
    saveReminders(remindersEnabled);
  }, [remindersEnabled]);

  const todayStr = now.toISOString().slice(0, 10);
  // Use local date string to avoid UTC offset issues
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySchedule =
    prayerData?.jadwal.find((j) => j.tanggal_lengkap === localDateStr) || null;

  const locationName =
    location.status === 'ready' || location.status === 'manual'
      ? `${location.kabkota}, ${location.provinsi}`
      : null;

  // Schedule reminders whenever today's schedule or toggle changes
  useEffect(() => {
    if (!todaySchedule || !remindersEnabled) {
      if (!remindersEnabled) clearReminders();
      return;
    }
    const prayers = (Object.keys(PRAYER_LABELS) as Array<keyof typeof todaySchedule>)
      .filter((k) => k in PRAYER_LABELS)
      .map((k) => ({
        name: k,
        label: PRAYER_LABELS[k],
        time: todaySchedule[k] as string,
      }));
    scheduleAll(prayers, localDateStr);
  }, [todaySchedule, remindersEnabled, localDateStr, scheduleAll, clearReminders]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col">
      <OfflineBanner />

      {/* Header */}
      <header className="px-5 pt-10 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-emerald-400 font-medium mb-1">
              Jadwal Shalat
            </p>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {locationName ?? 'Mendeteksi lokasi…'}
            </h1>
            {locationName && (
              <button
                onClick={() => {
                setLocation({ status: 'denied' });
                try { localStorage.removeItem('jadwal_location'); } catch {}
              }}
                className="mt-1 text-xs text-zinc-500 underline underline-offset-2"
              >
                Ubah lokasi
              </button>
            )}
          </div>
          {locationName && (
            <ReminderToggle
              enabled={remindersEnabled}
              onToggle={async (next) => {
                if (next) {
                  const granted = await requestPermission();
                  if (granted) setRemindersEnabled(true);
                  return granted;
                } else {
                  setRemindersEnabled(false);
                  return true;
                }
              }}
            />
          )}
        </div>
      </header>

      <main className="flex-1 px-5 pb-10 space-y-6">
        {/* Detecting */}
        {location.status === 'detecting' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <p className="text-zinc-400 text-sm">Mendeteksi lokasi GPS…</p>
          </div>
        )}

        {/* Location denied / manual */}
        {(location.status === 'denied' || location.status === 'idle') && (
          <LocationPicker onSelect={handleManualSelect} />
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Loading schedule */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <p className="text-zinc-400 text-sm">Memuat jadwal…</p>
          </div>
        )}

        {/* Today's prayer card */}
        {!loading && todaySchedule && (
          <PrayerCard schedule={todaySchedule} now={now} remindersEnabled={remindersEnabled} />
        )}

        {/* Full month grid */}
        {!loading && prayerData && (
          <PrayerGrid data={prayerData} today={todayStr} />
        )}
      </main>
    </div>
  );
}
