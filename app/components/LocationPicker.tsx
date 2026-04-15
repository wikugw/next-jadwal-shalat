'use client';

import { useState, useEffect } from 'react';

interface Props {
  onSelect: (provinsi: string, kabkota: string) => void;
}

export default function LocationPicker({ onSelect }: Props) {
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedProv, setSelectedProv] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [loadingProv, setLoadingProv] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    fetch('/api/shalat/provinsi')
      .then((r) => r.json())
      .then((json) => setProvinces(json.data || []))
      .finally(() => setLoadingProv(false));
  }, []);

  const handleProvChange = async (prov: string) => {
    setSelectedProv(prov);
    setSelectedCity('');
    setCities([]);
    if (!prov) return;
    setLoadingCities(true);
    const res = await fetch('/api/shalat/kabkota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provinsi: prov }),
    });
    const json = await res.json();
    setCities(json.data || []);
    setLoadingCities(false);
  };

  const handleSubmit = () => {
    if (selectedProv && selectedCity) {
      onSelect(selectedProv, selectedCity);
    }
  };

  return (
    <div className="rounded-2xl bg-[#161b22] border border-zinc-800 p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">📍</span>
        <p className="text-sm font-semibold text-zinc-200">Pilih Lokasi Manual</p>
      </div>
      <p className="text-xs text-zinc-500">
        Izin lokasi tidak tersedia. Pilih provinsi dan kota kamu.
      </p>

      {/* Province */}
      <div className="space-y-1">
        <label className="text-xs text-zinc-400 uppercase tracking-wide">Provinsi</label>
        <select
          value={selectedProv}
          onChange={(e) => handleProvChange(e.target.value)}
          disabled={loadingProv}
          className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
        >
          <option value="">{loadingProv ? 'Memuat…' : '— Pilih Provinsi —'}</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* City */}
      <div className="space-y-1">
        <label className="text-xs text-zinc-400 uppercase tracking-wide">Kabupaten / Kota</label>
        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          disabled={!selectedProv || loadingCities}
          className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
        >
          <option value="">
            {loadingCities ? 'Memuat…' : !selectedProv ? '— Pilih provinsi dulu —' : '— Pilih Kota —'}
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selectedProv || !selectedCity}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold rounded-xl py-3 text-sm transition-colors"
      >
        Lihat Jadwal
      </button>
    </div>
  );
}
