'use client';

import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    setOffline(!navigator.onLine);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5">
      <span className="text-amber-400 text-sm">📡</span>
      <p className="text-xs text-amber-300 font-medium">
        Offline — menampilkan data tersimpan
      </p>
    </div>
  );
}
