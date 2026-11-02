'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/form-bits';
import {
  DELIVERY_LABELS,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  MAX_LISTING_PHOTOS,
  MAX_PARCEL_KG,
  type ListingDelivery,
  type ListingPhoto,
} from '@/lib/bourse-shared';
import { saveListing, uploadListingPhoto } from './actions';

export type ListingDraft = {
  id?: string;
  machine_id?: string | null;
  sheet_id?: string | null;
  title: string;
  description: string;
  category: string;
  condition: string;
  price: string;
  negotiable: boolean;
  brand: string;
  model: string;
  year: string;
  hours: string;
  postal_code: string;
  city: string;
  delivery: ListingDelivery;
  weight_kg: string;
  shipping: string;
  photos: ListingPhoto[];
  published: boolean;
};

/** Photo réduite à 1 600 px dans le navigateur (envoi rapide, même en 4G). */
async function shrink(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Envoyez une photo (JPEG, PNG, HEIC…).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg', w: canvas.width, h: canvas.height, preview: dataUrl };
}

export function ListingForm({ draft, estimate }: { draft: ListingDraft; estimate?: { low: string; high: string } | null }) {
  const [state, action] = useActionState(saveListing, undefined);
  const [photos, setPhotos] = useState<ListingPhoto[]>(draft.photos);
  const [uploading, setUploading] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<ListingDelivery>(draft.delivery);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const room = MAX_LISTING_PHOTOS - photos.length - uploading.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) setPhotoError(`${MAX_LISTING_PHOTOS} photos au plus par annonce.`);
    for (const file of list) {
      try {
        const img = await shrink(file);
        setUploading((u) => [...u, img.preview]);
        const res = await uploadListingPhoto({ base64: img.base64, mime: img.mime, w: img.w, h: img.h });
        setUploading((u) => u.filter((p) => p !== img.preview));
        if ('error' in res) throw new Error(res.error);
        setPhotos((p) => [...p, res.ok]);
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : 'Envoi impossible.');
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const move = (i: number) => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)]);
  const remove = (i: number) => setPhotos((p) => p.filter((_, j) => j !== i));

  return (
    <form action={action} className="flex flex-wrap items-start gap-5">
      <input type="hidden" name="id" value={draft.id ?? ''} />
      <input type="hidden" name="machine_id" value={draft.machine_id ?? ''} />
      <input type="hidden" name="sheet_id" value={draft.sheet_id ?? ''} />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />

      <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
        {/* Photos */}
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Photos</h2>
          <p className="mb-4 text-sm text-muted">Jusqu’à {MAX_LISTING_PHOTOS} photos, la première sert de couverture. De face, de côté, les détails et l’usure : une annonce bien photographiée se vend bien plus vite.</p>
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {photos.map((p, i) => (
              <li key={p.path} className="group relative aspect-square overflow-hidden rounded-xl bg-ground">
                {/* eslint-disable-next-line @next/next/no-img-element -- photo envoyée par le vendeur */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                {i === 0 ? <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-on-brand">Couverture</span> : null}
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                  {i > 0 ? (
                    <button type="button" onClick={() => move(i)} className="rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80">
                      En couverture
                    </button>
                  ) : <span />}
                  <button type="button" onClick={() => remove(i)} aria-label={`Retirer la photo ${i + 1}`} className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-danger">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              </li>
            ))}
            {uploading.map((u) => (
              <li key={u} className="relative aspect-square overflow-hidden rounded-xl bg-ground">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local pendant l'envoi */}
                <img src={u} alt="" className="size-full object-cover opacity-50" />
                <span className="absolute inset-0 flex items-center justify-center"><span className="spinner" aria-label="Envoi en cours" /></span>
              </li>
            ))}
            {photos.length + uploading.length < MAX_LISTING_PHOTOS ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-field text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand-dark"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  Ajouter
                </button>
              </li>
            ) : null}
          </ul>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
          {photoError ? <p role="alert" className="mt-3 text-sm text-danger">{photoError}</p> : null}
        </section>

        {/* Description */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-semibold">L’annonce</h2>
          <Field label="Titre" htmlFor="l-title" hint="Ce que c’est, la marque, le modèle : « Herse rotative Kuhn HR 3004 », « Pneu 650/65 R38 Michelin ».">
            <Input id="l-title" name="title" defaultValue={draft.title} required minLength={5} maxLength={90} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Catégorie" htmlFor="l-cat">
              <Select id="l-cat" name="category" defaultValue={draft.category} required>
                <option value="" disabled>Choisir…</option>
                {Object.entries(LISTING_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="État" htmlFor="l-cond">
              <Select id="l-cond" name="condition" defaultValue={draft.condition} required>
                <option value="" disabled>Choisir…</option>
                {Object.entries(LISTING_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Marque" htmlFor="l-brand"><Input id="l-brand" name="brand" defaultValue={draft.brand} maxLength={60} /></Field>
            <Field label="Modèle" htmlFor="l-model"><Input id="l-model" name="model" defaultValue={draft.model} maxLength={80} /></Field>
            <Field label="Année (facultatif)" htmlFor="l-year"><Input id="l-year" name="year" inputMode="numeric" defaultValue={draft.year} maxLength={4} /></Field>
            <Field label="Heures au compteur (facultatif)" htmlFor="l-hours"><Input id="l-hours" name="hours" inputMode="decimal" defaultValue={draft.hours} /></Field>
          </div>
          <Field label="Description" htmlFor="l-desc" hint="Usage, entretien, réparations récentes, défauts éventuels, ce qui est inclus. Ne mettez ni téléphone ni e-mail : la messagerie du site vous protège.">
            <Textarea id="l-desc" name="description" rows={8} defaultValue={draft.description} maxLength={5000} />
          </Field>
        </section>

        {/* Remise */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Lieu et remise</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code postal" htmlFor="l-cp" hint="Seul le département et la commune sont affichés."><Input id="l-cp" name="postal_code" inputMode="numeric" defaultValue={draft.postal_code} required pattern="\d{5}" maxLength={5} /></Field>
            <Field label="Commune" htmlFor="l-city"><Input id="l-city" name="city" defaultValue={draft.city} required maxLength={100} /></Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Remise à l’acheteur</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(DELIVERY_LABELS) as ListingDelivery[]).map((d) => (
                <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${delivery === d ? 'border-brand bg-brand-tint' : 'border-line hover:border-field'}`}>
                  <input type="radio" name="delivery" value={d} checked={delivery === d} onChange={() => setDelivery(d)} className="accent-brand" />
                  {DELIVERY_LABELS[d]}
                </label>
              ))}
            </div>
          </fieldset>
          {delivery !== 'main_propre' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Poids du colis (kg)" htmlFor="l-weight" hint={`Emballage compris, ${MAX_PARCEL_KG} kg au plus.`}>
                <Input id="l-weight" name="weight_kg" inputMode="decimal" defaultValue={draft.weight_kg} />
              </Field>
              <Field label="Frais de port pour l’acheteur (€)" htmlFor="l-ship" hint="Ce que vous coûte l’envoi (Colissimo, Mondial Relay…). Ajouté au prix pour l’acheteur.">
                <Input id="l-ship" name="shipping" inputMode="decimal" defaultValue={draft.shipping} placeholder="Ex. : 12,90" />
              </Field>
            </div>
          ) : null}
        </section>
      </div>

      {/* Prix et publication */}
      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6 lg:sticky lg:top-6">
        <h2 className="text-xl font-semibold">Prix</h2>
        <div className="relative">
          <label htmlFor="l-price" className="sr-only">Prix en euros</label>
          <Input id="l-price" name="price" inputMode="decimal" defaultValue={draft.price} required className="pr-10 text-2xl font-bold" placeholder="0" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted">€</span>
        </div>
        {estimate ? (
          <p className="rounded-xl bg-brand-tint px-3 py-2 text-sm">
            Prix de revente estimé : <strong>{estimate.low} à {estimate.high}</strong>
          </p>
        ) : null}
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" name="negotiable" defaultChecked={draft.negotiable} className="size-5 accent-brand" />
          Prix à débattre
        </label>
        <p className="text-xs text-muted">L’annonce est gratuite. Avec le paiement sécurisé, vous recevez le prix affiché ; l’acheteur paie de petits frais de service.</p>
        {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p> : null}
        <SubmitButton name="intent" value="publier" pendingLabel="Publication…" className="w-full">
          {draft.published ? 'Enregistrer les modifications' : 'Publier l’annonce'}
        </SubmitButton>
        {!draft.published ? (
          <SubmitButton name="intent" value="brouillon" variant="secondary" pendingLabel="Enregistrement…" className="w-full">
            Enregistrer le brouillon
          </SubmitButton>
        ) : null}
        <p className="text-xs text-muted">
          En publiant, vous acceptez les <Link href="/conditions#bourse" target="_blank" className="underline underline-offset-2">règles de la bourse</Link> : matériel agricole uniquement, photos réelles, une annonce par objet.
        </p>
      </aside>
      {uploading.length ? <p className="sr-only" aria-live="polite">Envoi des photos en cours…</p> : null}
    </form>
  );
}
