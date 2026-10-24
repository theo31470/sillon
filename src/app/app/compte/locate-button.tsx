'use client';

import { useState } from 'react';
import { btn } from '@/components/ui';

/** Remplit la latitude/longitude avec la position du téléphone ou de l'ordinateur. */
export function LocateButton() {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={btn.small}
        onClick={() => {
          if (!navigator.geolocation) return setStatus('Localisation non disponible sur cet appareil.');
          setStatus('Recherche de la position…');
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const lat = document.getElementById('latitude') as HTMLInputElement | null;
              const lon = document.getElementById('longitude') as HTMLInputElement | null;
              if (lat) lat.value = pos.coords.latitude.toFixed(4);
              if (lon) lon.value = pos.coords.longitude.toFixed(4);
              setStatus('Position trouvée : pensez à enregistrer.');
            },
            () => setStatus('Position refusée ou introuvable. Saisissez-la à la main.'),
            { enableHighAccuracy: false, timeout: 10000 },
          );
        }}
      >
        Utiliser ma position actuelle
      </button>
      {status ? <p className="text-sm text-muted" role="status">{status}</p> : null}
    </div>
  );
}
