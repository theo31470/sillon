'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Coche / décoche tous les modèles affichés. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Tout sélectionner"
      className="size-4 accent-brand"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`#${formId} input[name="ids"]:not(:disabled)`).forEach((box) => {
          box.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}

/** Rafraîchit la page toutes les 10 s tant que la file travaille. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}

/** Relance la file immédiatement (sans attendre la tâche planifiée de la minute). */
export function KickButton() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  return (
    <button
      type="button"
      disabled={sent}
      onClick={async () => {
        setSent(true);
        await fetch('/api/catalogue/tick', { method: 'POST' }).catch(() => null);
        router.refresh();
        setTimeout(() => setSent(false), 5000);
      }}
      className="text-sm font-semibold text-brand transition-colors hover:text-brand-dark disabled:text-muted"
    >
      {sent ? 'Relancée' : 'Relancer maintenant'}
    </button>
  );
}
