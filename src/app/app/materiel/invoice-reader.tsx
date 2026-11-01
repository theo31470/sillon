'use client';

import { useActionState, useRef, useState } from 'react';
import { Field, Input, Select, Textarea, btn } from '@/components/ui';
import { readInvoice, saveInvoice } from './facture-actions';
import type { InvoiceReading } from '@/lib/invoice-reader';

type Op = { label: string; on: boolean };

/** Photo réduite à 2 200 px de côté (lisible pour Claude, légère à envoyer). */
async function prepare(file: File): Promise<{ base64: string; mime: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > 4 * 1024 * 1024) throw new Error('PDF trop lourd (4 Mo au plus) : envoyez plutôt une photo de la facture.');
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), mime: 'application/pdf' };
  }
  if (!file.type.startsWith('image/')) throw new Error('Envoyez une photo ou un PDF.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  return { base64: dataUrl.split(',')[1], mime: 'image/jpeg' };
}

const euro = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

export function InvoiceReader({ machineId, hoursNow, remaining: initialRemaining }: { machineId: string; hoursNow: number; remaining: number }) {
  const [stage, setStage] = useState<'pick' | 'reading' | 'review'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<InvoiceReading | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [extra, setExtra] = useState('');
  const [remaining, setRemaining] = useState(initialRemaining);
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, save] = useActionState(async (prev: Awaited<ReturnType<typeof saveInvoice>> | undefined, fd: FormData) => {
    const res = await saveInvoice(prev, fd);
    if (res?.ok) {
      // Enregistré : retour à l'envoi d'une nouvelle facture.
      setStage('pick');
      setReading(null);
      setOps([]);
      setExtra('');
      setPreview(null);
    }
    return res;
  }, undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage('reading');
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    try {
      const { base64, mime } = await prepare(file);
      const res = await readInvoice({ machineId, base64, mime });
      if ('error' in res) throw new Error(res.error);
      setReading(res.ok);
      setRemaining(res.remaining);
      setOps(res.ok.operations.map((o) => ({ label: o.label, on: true })));
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
      setStage('pick');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (stage === 'review' && reading) {
    const parts = reading.parts.map((p) => `${p.name}${p.reference ? ` (réf. ${p.reference})` : ''}${p.quantity && p.quantity !== 1 ? ` ×${String(p.quantity).replace('.', ',')}` : ''}`);
    const notes = [reading.summary, parts.length ? `Pièces : ${parts.join(', ')}` : '', reading.invoice_number ? `Facture n° ${reading.invoice_number}` : ''].filter(Boolean).join('\n');
    const validDate = reading.date && /^\d{4}-\d{2}-\d{2}$/.test(reading.date) && reading.date <= today ? reading.date : today;
    return (
      <form action={save} className="flex flex-col gap-4">
        <input type="hidden" name="machine_id" value={machineId} />
        <div className="flex gap-3 rounded-xl bg-brand-tint p-3 text-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie
            <img src={preview} alt="Facture envoyée" className="h-20 w-16 flex-none rounded-md object-cover" />
          ) : null}
          <p>
            <strong>Vérifiez avant d’enregistrer.</strong> Claude a lu la facture{reading.garage ? ` de ${reading.garage}` : ''} : corrigez si besoin, décochez ce qui ne
            concerne pas cette machine.
            {reading.machine ? <span className="block text-muted">Machine indiquée sur la facture : {reading.machine}</span> : null}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="inv-date">
            <Input id="inv-date" name="date" type="date" defaultValue={validDate} max={today} required />
          </Field>
          <Field label="Compteur (h)" htmlFor="inv-hours" hint={reading.hours === null ? 'Non lu sur la facture' : undefined}>
            <Input id="inv-hours" name="hours" inputMode="decimal" defaultValue={reading.hours === null ? '' : String(reading.hours)} placeholder={String(hoursNow)} />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Opérations à noter dans le carnet</legend>
          {ops.length === 0 ? <p className="text-sm text-muted">Aucune opération lue : ajoutez-la ci-dessous.</p> : null}
          {ops.map((o, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={o.on}
                onChange={(e) => setOps((list) => list.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                aria-label={`Noter : ${o.label}`}
                className="size-5 flex-none accent-[var(--color-brand)]"
              />
              <Input
                name="operation"
                value={o.label}
                disabled={!o.on}
                maxLength={160}
                aria-label="Opération"
                onChange={(e) => setOps((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="disabled:opacity-50"
              />
            </div>
          ))}
          <Input name="operation" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={160} placeholder="Autre opération (facultatif)" aria-label="Autre opération" />
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant (€ HT)" htmlFor="inv-amount" hint={reading.total_ttc !== null ? `TTC lu : ${euro(reading.total_ttc)} €` : undefined}>
            <Input id="inv-amount" name="amount" inputMode="decimal" defaultValue={euro(reading.total_ht ?? reading.total_ttc)} />
          </Field>
          <Field label="Type de dépense" htmlFor="inv-kind">
            <Select id="inv-kind" name="kind" defaultValue={reading.kind}>
              <option value="entretien">Entretien</option>
              <option value="reparation">Réparation</option>
              <option value="pneumatiques">Pneumatiques</option>
              <option value="autre">Autre</option>
            </Select>
          </Field>
        </div>
        <Field label="Garage" htmlFor="inv-garage">
          <Input id="inv-garage" name="garage" defaultValue={reading.garage ?? ''} maxLength={80} />
        </Field>
        <Field label="Notes" htmlFor="inv-notes">
          <Textarea id="inv-notes" name="notes" defaultValue={notes} rows={3} maxLength={900} />
        </Field>
        {saved?.error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{saved.error}</p> : null}
        <div className="flex flex-wrap gap-2.5">
          <button type="submit" className={btn.primary}>Enregistrer dans le carnet</button>
          <button type="button" className={btn.secondary} onClick={() => setStage('pick')}>Annuler</button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {saved?.ok && saved.message ? <p role="status" className="rounded-[10px] bg-success-soft px-4 py-3 text-sm text-success">{saved.message}</p> : null}
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-field px-4 py-7 text-center transition-colors hover:border-brand ${stage === 'reading' ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          disabled={stage === 'reading' || remaining <= 0}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {stage === 'reading' ? (
          <>
            <span className="spinner" aria-hidden="true" />
            <span className="font-semibold">Claude lit la facture…</span>
            <span className="text-sm text-muted">10 à 20 secondes</span>
          </>
        ) : (
          <>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span className="font-semibold">Prendre la facture en photo</span>
            <span className="text-sm text-muted">ou choisir une photo ou un PDF</span>
          </>
        )}
      </label>
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <p className="text-xs text-muted">
        {remaining > 0 ? `${remaining} lecture${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} ce mois-ci.` : 'Lectures du mois épuisées : le compteur repart le 1er du mois.'} La
        facture n’est pas conservée : seules les informations que vous validez sont enregistrées.
      </p>
    </div>
  );
}
