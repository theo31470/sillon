'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { btn } from '@/components/ui';
import { estimateResale } from './valuation-actions';

export type ResaleView = {
  low: string;
  mid: string;
  high: string;
  date: string;
  method: string;
  newPrice: string | null;
  comparables: { title: string; year: number | null; hours: number | null; price: string; url: string | null }[];
  notes: string;
  bonus: number;
} | null;

/** Carte « Prix de revente estimé » de la page machine. */
export function ResaleCard({ machineId, view, paid, remaining }: { machineId: string; view: ResaleView; paid: boolean; remaining: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () => {
    setError(null);
    start(async () => {
      const res = await estimateResale(machineId);
      if ('error' in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {view ? (
        <>
          <div className="rounded-2xl bg-admin p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-panel-muted">Prix de revente estimé</p>
            <p className="font-display text-3xl font-bold tabular-nums">{view.mid}</p>
            <p className="text-sm text-panel-muted">
              entre {view.low} et {view.high} · le {view.date}
            </p>
            <div className="relative mt-3 h-2 rounded-full bg-white/15" aria-hidden="true">
              <span className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-gradient-to-r from-[#d4a955] via-[#e0875a] to-[#d4a955]" />
              <span className="absolute -top-1 left-1/2 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-[#e0875a]" />
            </div>
          </div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="self-start text-sm font-semibold text-brand-dark hover:underline">
            {open ? 'Masquer le détail' : 'Comment c’est calculé ?'}
          </button>
          {open ? (
            <div className="flex flex-col gap-2 rounded-xl bg-ground p-3 text-sm">
              <p>Méthode : {view.method}{view.newPrice ? `, à partir d’un prix neuf d’environ ${view.newPrice}` : ''}.{view.bonus > 0 ? ' Bonus de 3 % pour un carnet d’entretien bien tenu.' : view.bonus < 0 ? ' Aucun entretien noté depuis 2 ans : −3 %.' : ''}</p>
              {view.comparables.length ? (
                <ul className="flex flex-col gap-1">
                  {view.comparables.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-muted">
                        {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.title}</a> : c.title}
                        {[c.year, c.hours ? `${c.hours} h` : null].filter(Boolean).length ? ` · ${[c.year, c.hours ? `${c.hours} h` : null].filter(Boolean).join(' · ')}` : ''}
                      </span>
                      <span className="flex-none font-semibold tabular-nums">{c.price}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {view.notes ? <p className="text-muted">{view.notes}</p> : null}
              <p className="text-xs text-muted">Estimation indicative, pas une cote officielle : l’état réel, les options et la région font varier le prix.</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">
          Combien vaut cette machine aujourd’hui ? L’estimation part du prix neuf du modèle, applique la décote de référence selon l’âge et les heures, et la compare aux offres
          d’occasion du marché.
        </p>
      )}
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {paid ? (
          <button type="button" onClick={run} disabled={pending || remaining <= 0} className={view ? btn.secondary : btn.primary}>
            {pending ? (
              <>
                <span className="spinner" aria-hidden="true" /> Recherche des prix du marché…
              </>
            ) : view ? (
              'Actualiser l’estimation'
            ) : (
              'Estimer le prix de revente'
            )}
          </button>
        ) : (
          <Link href="/app/abonnement" className={btn.secondary}>Estimation incluse dans le Complet</Link>
        )}
        <Link href={`/app/annonces/nouvelle?machine=${machineId}`} className={btn.primary}>
          Mettre en vente sur la bourse
        </Link>
      </div>
      {paid ? <p className="text-xs text-muted">{remaining} estimation{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} ce mois-ci · environ 30 secondes.</p> : null}
    </div>
  );
}
