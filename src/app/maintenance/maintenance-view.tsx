'use client';

import { useEffect, useRef, useState } from 'react';

/** Toile 3D (chargée à part : three.js n'alourdit que cette page) et rechargement automatique à la réouverture. */
export function MaintenanceScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('./scene')
      .then(({ createMaintenanceScene }) => {
        if (cancelled) return;
        try {
          dispose = createMaintenanceScene(canvas, { reducedMotion, onReady: () => setReady(true) });
        } catch (err) {
          console.warn('[maintenance] WebGL indisponible', err);
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`absolute inset-0 size-full transition-opacity duration-[1600ms] ease-out ${ready && !failed ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

/**
 * Vérifie toutes les 30 secondes si le site est rouvert, puis recharge la page
 * demandée (ou l'accueil si l'on était sur /maintenance). `reopened` : déjà rouvert.
 */
export function ReopenWatcher({ preview, reopened = false }: { preview: boolean; reopened?: boolean }) {
  useEffect(() => {
    if (preview) return;
    const leave = () => {
      if (window.location.pathname === '/maintenance') window.location.replace('/');
      else window.location.reload();
    };
    if (reopened) {
      const t = setTimeout(leave, 4000);
      return () => clearTimeout(t);
    }
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/statut', { cache: 'no-store' });
        const json = (await res.json()) as { maintenance: boolean };
        if (!json.maintenance) leave();
      } catch {
        /* réseau coupé : on réessaie au prochain tour */
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [preview, reopened]);
  return null;
}
