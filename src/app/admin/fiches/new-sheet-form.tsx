'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Field, Input, Select, btn } from '@/components/ui';

const MAX_FILES = 3;
const MAX_FILE_MB = 20;

/**
 * Génération d'une fiche par Claude.
 * Les PDF sont envoyés directement dans le stockage privé (réservé aux admins),
 * puis le serveur les transmet à Claude : aucune limite de taille côté hébergeur.
 */
export function NewSheetForm() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return setError('Ajoutez au moins un document PDF (manuel constructeur, catalogue de pièces…).');
    if (files.length > MAX_FILES) return setError(`${MAX_FILES} documents maximum.`);
    for (const f of files) {
      if (f.type !== 'application/pdf') return setError(`${f.name} n’est pas un PDF.`);
      if (f.size > MAX_FILE_MB * 1024 * 1024) return setError(`${f.name} dépasse ${MAX_FILE_MB} Mo.`);
    }

    setBusy(true);
    try {
      setStatus('Envoi des documents…');
      const supabase = createClient();
      const folder = crypto.randomUUID();
      const sources = [];
      for (const f of files) {
        const safeName = f.name.normalize('NFD').replace(/[^\w.\- ]/g, '_').slice(-100);
        const name = /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;
        const path = `${folder}/${name}`;
        const { error: upErr } = await supabase.storage.from('sources').upload(path, f, { contentType: 'application/pdf' });
        if (upErr) throw new Error(`Envoi de ${f.name} impossible`);
        sources.push({ name: f.name, path });
      }

      setStatus('Claude lit les documents et rédige la fiche (1 à 3 minutes)…');
      const res = await fetch('/api/admin/fiches/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          category: form.get('category'),
          brand: form.get('brand'),
          model: form.get('model'),
          sections: form.getAll('sections'),
          sources,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'La génération a échoué');
      setStatus('Fiche prête, ouverture de la relecture…');
      router.push(`/admin/fiches/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue');
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field label="Type de fiche" htmlFor="category">
        <Select id="category" name="category" defaultValue="machine">
          <option value="machine">Machine</option>
          <option value="culture">Culture</option>
          <option value="produit">Produit</option>
          <option value="panne">Panne</option>
        </Select>
      </Field>
      <Field label="Titre de la fiche" htmlFor="title">
        <Input id="title" name="title" required maxLength={160} placeholder="Ex. : Motoculteur 9 ch à fraise" />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Marque" htmlFor="brand"><Input id="brand" name="brand" maxLength={80} /></Field>
        <Field label="Modèle" htmlFor="model"><Input id="model" name="model" maxLength={80} /></Field>
      </div>
      <Field label={`Sources (PDF, ${MAX_FILES} max, ${MAX_FILE_MB} Mo chacun)`} htmlFor="files">
        <input id="files" name="files" type="file" accept="application/pdf" multiple required className="rounded-[10px] border-2 border-dashed border-field bg-ground p-4 text-sm" />
      </Field>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-semibold">Sections à rédiger</legend>
        {[
          ['specs', 'Caractéristiques'],
          ['maintenance', 'Plan d’entretien'],
          ['faults', 'Pannes fréquentes'],
          ['parts', 'Pièces et références'],
        ].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="checkbox" name="sections" value={v} defaultChecked className="size-4 accent-brand" />{l}
          </label>
        ))}
      </fieldset>
      {error ? <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      {status ? <p role="status" className="rounded-[10px] bg-brand-tint px-4 py-3 text-sm text-brand-dark">{status}</p> : null}
      <button type="submit" disabled={busy} className={btn.primary}>✦ Générer le brouillon</button>
      <p className="text-[13px] text-muted">Claude n’utilise que les documents fournis. Ce qu’il ne trouve pas est marqué « à vérifier », jamais inventé.</p>
    </form>
  );
}
