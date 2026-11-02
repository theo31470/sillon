'use client';

import { useActionState, useEffect, useState } from 'react';
import { SubmitButton } from '@/components/form-bits';
import { REPORT_REASONS, type ListingPhoto } from '@/lib/bourse-shared';
import { contactSeller, reportListing, toggleFavorite } from '@/app/app/messages/actions';

/** Galerie : grande photo, vignettes, plein écran au toucher. */
export function Gallery({ photos, title }: { photos: ListingPhoto[]; title: string }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const n = photos.length;
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % n);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, n]);
  if (!n) return <div className="aspect-[4/3] rounded-2xl bg-surface-2" />;
  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setI((x) => (x + dir + n) % n);
      }}
      aria-label={dir === 1 ? 'Photo suivante' : 'Photo précédente'}
      className={`absolute top-1/2 ${dir === 1 ? 'right-2' : 'left-2'} flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/70`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 1 ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
      </svg>
    </button>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        <button type="button" onClick={() => setFull(true)} className="block size-full" aria-label="Agrandir la photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo envoyée par le vendeur */}
          <img src={photos[i].url} alt={`${title}, photo ${i + 1} sur ${n}`} className="size-full object-contain" />
        </button>
        {n > 1 ? (
          <>
            {arrow(-1)}
            {arrow(1)}
            <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">{i + 1} / {n}</span>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, j) => (
            <button key={p.path} type="button" onClick={() => setI(j)} aria-label={`Photo ${j + 1}`} aria-current={i === j} className={`size-16 flex-none overflow-hidden rounded-lg border-2 sm:size-20 ${i === j ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- vignette */}
              <img src={p.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      {full ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95" role="dialog" aria-modal="true" aria-label="Photos" onClick={() => setFull(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- photo en grand */}
          <img src={photos[i].url} alt={`${title}, photo ${i + 1}`} className="max-h-full max-w-full object-contain" />
          {n > 1 ? (
            <>
              {arrow(-1)}
              {arrow(1)}
            </>
          ) : null}
          <button type="button" onClick={() => setFull(false)} aria-label="Fermer" className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-white/15 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function FavoriteButton({ listingId, initial }: { listingId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setOn(!on);
        void toggleFavorite(listingId, !on).catch(() => setOn(on));
      }}
      className={`btn inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-4 font-semibold transition-colors ${on ? 'border-brand bg-brand-tint text-brand-dark' : 'border-field bg-surface hover:border-brand'}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
      {on ? 'Dans mes favoris' : 'Favori'}
    </button>
  );
}

const QUICK = ['Bonjour, est-ce toujours disponible ?', 'Bonjour, le prix est-il négociable ?', 'Bonjour, pouvez-vous m’envoyer d’autres photos ?'];

export function ContactBox({ listingId, refCode, sellerName }: { listingId: string; refCode: string; sellerName: string }) {
  const [state, action] = useActionState(contactSeller, undefined);
  const [text, setText] = useState('');
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="ref" value={refCode} />
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setText(q)} className="rounded-full border border-field px-3 py-1.5 text-xs font-semibold hover:border-brand">
            {q.replace('Bonjour, ', '').replace(/^\w/, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
      <label htmlFor="contact-body" className="sr-only">Message à {sellerName}</label>
      <textarea
        id="contact-body"
        name="body"
        rows={4}
        required
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Écrivez à ${sellerName}`}
        className="w-full rounded-[10px] border border-field bg-surface px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <SubmitButton pendingLabel="Envoi…" className="w-full">Envoyer le message</SubmitButton>
    </form>
  );
}

export function ReportBox({ listingId }: { listingId: string }) {
  const [state, action] = useActionState(reportListing, undefined);
  if (state?.ok) return <p className="text-sm text-success">{state.message}</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Signaler l’annonce</summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="listing_id" value={listingId} />
        <select name="reason" required defaultValue="" className="min-h-11 rounded-[10px] border border-field bg-surface px-3">
          <option value="" disabled>Raison…</option>
          {Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <textarea name="details" rows={2} maxLength={1000} placeholder="Précisions (facultatif)" className="rounded-[10px] border border-field bg-surface px-3 py-2" />
        {state?.error ? <p role="alert" className="text-danger">{state.error}</p> : null}
        <SubmitButton variant="small" pendingLabel="Envoi…">Envoyer le signalement</SubmitButton>
      </form>
    </details>
  );
}
