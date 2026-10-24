'use client';

import { useEffect, useState } from 'react';
import { ESTIMATED_COST_USD } from '@/lib/catalog-shared';
import { useRouter } from 'next/navigation';

/** Coche / décoche tous les modèles affichés. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Tout sélectionner"
      className="size-4 accent-brand"
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        const form = document.getElementById(formId);
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]:not(:disabled)').forEach((box) => {
          box.checked = checked;
        });
        // Met à jour l'estimation de coût.
        form?.dispatchEvent(new Event('change'));
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

/** Estimation du coût de la sélection : une recherche par série + une rédaction par modèle. */
export function CostEstimate({ formId }: { formId: string }) {
  const [sel, setSel] = useState({ models: 0, series: 0 });
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const update = () => {
      const boxes = [...form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked')];
      setSel({ models: boxes.length, series: new Set(boxes.map((b) => b.dataset.series)).size });
    };
    form.addEventListener('change', update);
    return () => form.removeEventListener('change', update);
  }, [formId]);
  const cost = sel.series * ESTIMATED_COST_USD.perSeries + sel.models * ESTIMATED_COST_USD.perModel;
  return (
    <p className="text-sm text-muted">
      {sel.models === 0 ? (
        'Cochez les modèles, puis lancez la génération. Une fiche déjà créée peut être régénérée.'
      ) : (
        <>
          <strong className="text-ink">{sel.models} modèle(s)</strong>, {sel.series} série(s) à rechercher · coût estimé{' '}
          <strong className="text-ink">≈ {cost.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $</strong>
        </>
      )}
    </p>
  );
}
