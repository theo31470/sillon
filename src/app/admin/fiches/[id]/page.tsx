import Image from 'next/image';
import Link from 'next/link';
import { PhotoCreditLine } from '@/components/sheets/photo-credit';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { countPendingReview, parseSheetContent } from '@/lib/sheets/schema';
import { SHEET_STATUSES, type TechSheet } from '@/lib/types';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Field, Input, Notice, Textarea } from '@/components/ui';
import { CheckSourced } from './check-sourced';
import { askClaude, changeStatus, deleteSheet, findPhoto, publishSheet, regenerateSheet, removePhoto, saveReview, uploadPhoto } from './actions';

export const metadata = { title: 'Relecture de fiche' };
export const maxDuration = 300; // corrections par Claude

type Src = { document: string; page: number | null; url?: string | null } | null;

function SourceChip({ source, needsReview }: { source: Src; needsReview: boolean }) {
  if (needsReview && !source) return <Badge tone="amber">Non trouvé dans les sources</Badge>;
  if (!source) return <Badge>Vérifié</Badge>;
  const text = `${needsReview ? 'À vérifier · ' : ''}${source.document}${source.page ? ` p. ${source.page}` : ''}`;
  const badge = <Badge tone={needsReview ? 'amber' : 'green'}>{text.length > 60 ? `${text.slice(0, 58)}…` : text}</Badge>;
  return source.url && /^https?:\/\//.test(source.url) ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.url} className="transition-opacity hover:opacity-75">{badge}<span className="sr-only"> (ouvrir la source)</span> ↗</a>
  ) : (
    badge
  );
}

const ORIGIN_OPTIONS = { constructeur: 'Constructeur', presse: 'Presse', utilisateurs: 'Utilisateurs', general: 'Repère indicatif' } as const;

function OriginSelect({ name, value }: { name: string; value?: string }) {
  return (
    <select aria-label="Origine de l’information" name={name} defaultValue={value ?? 'constructeur'} className="ml-2 rounded-md border border-line px-1.5 py-0.5 text-xs font-normal">
      {Object.entries(ORIGIN_OPTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

function Verified({ name, needsReview, sourced }: { name: string; needsReview: boolean; sourced: boolean }) {
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
      <input type="checkbox" name={name} defaultChecked={!needsReview} data-sourced={sourced ? 'true' : undefined} className="size-4 accent-brand" />
      Vérifié
    </label>
  );
}

export default async function ReviewSheetPage(props: PageProps<'/admin/fiches/[id]'>) {
  const { id } = await props.params;
  await requireAdmin(`/admin/fiches/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('tech_sheets').select('*').eq('id', id).maybeSingle();
  const sheet = data as TechSheet | null;
  if (!sheet) notFound();
  const content = parseSheetContent(sheet.content);
  const pending = countPendingReview(content);
  const row = 'grid items-center gap-3 border-b border-[#eef0eb] px-4 py-2.5 text-sm [grid-template-columns:minmax(120px,180px)_1fr_auto_auto] last:border-0';
  const field = 'min-w-0 rounded-md border border-line px-2 py-1.5';

  return (
    <>
      <Link href="/admin/fiches" className="text-sm text-brand">← Toutes les fiches</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-warn">{SHEET_STATUSES[sheet.status]} · mis à jour le {formatDate(sheet.updated_at, { hour: '2-digit', minute: '2-digit' })}{sheet.ai_model ? ` · rédigé par ${sheet.ai_model}` : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight">{sheet.title}</h1>
        </div>
        <p className="text-sm text-muted">{pending ? <strong className="text-warn">{pending} champ(s) à vérifier</strong> : <strong className="text-brand">Tout est vérifié</strong>}</p>
      </div>

      {sheet.status === 'generating' ? <Notice tone="gray">Génération en cours… Rechargez la page dans une minute.</Notice> : null}
      {sheet.status === 'rejected' ? <Notice tone="red">{sheet.summary || 'Fiche rejetée.'}</Notice> : null}
      {(sheet.status === 'rejected' || sheet.status === 'generating') && (sheet.sources ?? []).length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted">Les sources sont conservées : vous pouvez relancer la rédaction sans rien renvoyer.</p>
          <ActionForm action={regenerateSheet} resetOnSuccess={false} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={sheet.id} />
            <SubmitButton pendingLabel="Claude lit les documents (1 à 3 min)…">✦ Relancer avec Claude</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        <ActionForm action={saveReview} resetOnSuccess={false} id="review" className="flex min-w-0 flex-[3_1_620px] flex-col gap-5">
          <input type="hidden" name="id" value={sheet.id} />
          <Card className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <Field label="Titre" htmlFor="title"><Input id="title" name="title" defaultValue={sheet.title} required /></Field>
            <Field label="Adresse (/fiches/…)" htmlFor="slug"><Input id="slug" name="slug" defaultValue={sheet.slug} /></Field>
            <Field label="Marque" htmlFor="brand"><Input id="brand" name="brand" defaultValue={sheet.brand} /></Field>
            <Field label="Modèle" htmlFor="model"><Input id="model" name="model" defaultValue={sheet.model} /></Field>
            <div className="col-span-full">
              <Field label="Résumé" htmlFor="summary"><Textarea id="summary" name="summary" defaultValue={content.summary} rows={2} maxLength={600} /></Field>
            </div>
          </Card>

          {content.specs.map((g, gi) => (
            <section key={g.group} className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line bg-[#fafbf9] px-4 py-2.5 text-sm font-semibold">Caractéristiques · {g.group}</h2>
              {g.items.map((it, ii) => (
                <div key={it.label} className={`${row} ${it.needs_review ? 'bg-warn-soft' : ''}`}>
                  <span className="text-muted">{it.label}</span>
                  <input aria-label={it.label} name={`specs.${gi}.${ii}.value`} defaultValue={it.value ?? ''} placeholder="Non trouvé dans les sources" className={field} />
                  <SourceChip source={it.source} needsReview={it.needs_review} />
                  <Verified name={`specs.${gi}.${ii}.ok`} needsReview={it.needs_review} sourced={Boolean(it.source && it.value)} />
                </div>
              ))}
            </section>
          ))}

          {content.maintenance.length ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line bg-[#fafbf9] px-4 py-2.5 text-sm font-semibold">Plan d’entretien</h2>
              {content.maintenance.map((m, i) => (
                <div key={m.operation} className={`flex flex-col gap-2 border-b border-[#eef0eb] px-4 py-3 text-sm last:border-0 ${m.needs_review ? 'bg-warn-soft' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{m.operation} <OriginSelect name={`maintenance.${i}.origin`} value={m.origin} /></strong>
                    <span className="flex items-center gap-3"><SourceChip source={m.source} needsReview={m.needs_review} /><Verified name={`maintenance.${i}.ok`} needsReview={m.needs_review} sourced={Boolean(m.source)} /></span>
                  </div>
                  <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                    <input aria-label="Intervalle en heures" name={`maintenance.${i}.interval_hours`} defaultValue={m.interval_hours ?? ''} placeholder="Toutes les … h" className={field} />
                    <input aria-label="Intervalle en mois" name={`maintenance.${i}.interval_months`} defaultValue={m.interval_months ?? ''} placeholder="… mois" className={field} />
                    <input aria-label="Produit" name={`maintenance.${i}.product`} defaultValue={m.product ?? ''} placeholder="Produit" className={field} />
                    <input aria-label="Quantité" name={`maintenance.${i}.capacity`} defaultValue={m.capacity ?? ''} placeholder="Quantité" className={field} />
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {content.faults.length ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line bg-[#fafbf9] px-4 py-2.5 text-sm font-semibold">Pannes fréquentes</h2>
              {content.faults.map((f, i) => (
                <div key={f.symptom} className={`flex flex-col gap-2 border-b border-[#eef0eb] px-4 py-3 text-sm last:border-0 ${f.needs_review ? 'bg-warn-soft' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{f.symptom} <OriginSelect name={`faults.${i}.origin`} value={f.origin} /></strong>
                    <span className="flex items-center gap-3">
                      <select aria-label="Difficulté" name={`faults.${i}.difficulty`} defaultValue={f.difficulty} className={field}>
                        <option value="facile">Réparable soi-même</option>
                        <option value="atelier">Atelier conseillé</option>
                      </select>
                      <SourceChip source={f.source} needsReview={f.needs_review} />
                      <Verified name={`faults.${i}.ok`} needsReview={f.needs_review} sourced={Boolean(f.source)} />
                    </span>
                  </div>
                  <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                    <label className="flex flex-col gap-1 text-muted">Causes (une par ligne)<textarea name={`faults.${i}.causes`} defaultValue={f.causes.join('\n')} rows={3} className={`${field} text-ink`} /></label>
                    <label className="flex flex-col gap-1 text-muted">Vérifications, dans l’ordre (une par ligne)<textarea name={`faults.${i}.checks`} defaultValue={f.checks.join('\n')} rows={3} className={`${field} text-ink`} /></label>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {content.parts.length ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line bg-[#fafbf9] px-4 py-2.5 text-sm font-semibold">Pièces et références</h2>
              {content.parts.map((p, i) => (
                <div key={p.name} className={`${row} ${p.needs_review ? 'bg-warn-soft' : ''}`}>
                  <span className="text-muted">{p.name}</span>
                  <span className="grid grid-cols-[2fr_1fr] gap-2">
                    <input aria-label={`Référence ${p.name}`} name={`parts.${i}.reference`} defaultValue={p.reference ?? ''} placeholder="Référence" className={field} />
                    <input aria-label={`Quantité ${p.name}`} name={`parts.${i}.quantity`} defaultValue={p.quantity ?? ''} placeholder="Qté" className={field} />
                  </span>
                  <SourceChip source={p.source} needsReview={p.needs_review} />
                  <Verified name={`parts.${i}.ok`} needsReview={p.needs_review} sourced={Boolean(p.source)} />
                </div>
              ))}
            </section>
          ) : null}

          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg">
            <p className="text-sm text-muted">Cochez « Vérifié » après avoir contrôlé chaque valeur dans la source.</p>
            <CheckSourced formId="review" />
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer la relecture</SubmitButton>
          </div>
        </ActionForm>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Publication</h2>
            <p className="mb-3 text-sm text-muted">Possible uniquement quand plus aucun champ n’est à vérifier.</p>
            <ActionForm action={publishSheet} resetOnSuccess={false}>
              <input type="hidden" name="id" value={sheet.id} />
              <SubmitButton pendingLabel="Publication…">{sheet.status === 'published' ? 'Republier' : 'Valider et publier'}</SubmitButton>
            </ActionForm>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {sheet.status === 'published' ? (
                <>
                  <Link href={`/fiches/${sheet.slug}`} target="_blank" className="font-semibold text-brand">Voir sur le site</Link>
                  <form action={changeStatus}><input type="hidden" name="id" value={sheet.id} /><input type="hidden" name="to" value="review" /><button className="font-semibold text-warn">Dépublier</button></form>
                </>
              ) : (
                <form action={changeStatus}><input type="hidden" name="id" value={sheet.id} /><input type="hidden" name="to" value="rejected" /><button className="font-semibold text-danger">Rejeter</button></form>
              )}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Photo</h2>
            {sheet.cover_url ? (
              <div className="relative mb-3 overflow-hidden rounded-xl">
                <Image src={sheet.cover_url} alt={sheet.title} width={560} height={360} className="h-44 w-full object-cover" />
                <PhotoCreditLine credit={sheet.cover_credit} />
              </div>
            ) : (
              <p className="mb-3 text-sm text-muted">Pas de photo : la fiche affiche une illustration.</p>
            )}
            <ActionForm action={findPhoto} resetOnSuccess={false} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={sheet.id} />
              <SubmitButton variant="secondary" pendingLabel="Claude regarde les photos…">✦ Chercher une photo libre</SubmitButton>
              <p className="text-xs text-muted">Wikimedia Commons, licences libres uniquement. Auteur et licence affichés sur la fiche.</p>
            </ActionForm>
            <details className="mt-3 rounded-lg border border-line px-3 py-2">
              <summary className="text-sm font-semibold">Déposer une photo (photo presse, photo personnelle…)</summary>
              <ActionForm action={uploadPhoto} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="id" value={sheet.id} />
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
                <Field label="Auteur / détenteur des droits" htmlFor="author"><Input id="author" name="author" required maxLength={120} placeholder="Ex. : © Deutz-Fahr" /></Field>
                <Field label="Licence ou autorisation" htmlFor="license"><Input id="license" name="license" required maxLength={160} placeholder="Ex. : photo presse, usage éditorial autorisé" /></Field>
                <Field label="Lien vers la source (facultatif)" htmlFor="source_url"><Input id="source_url" name="source_url" type="url" maxLength={500} /></Field>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="rights" required className="mt-0.5 size-4 flex-none accent-brand" />
                  J’ai l’autorisation de publier cette photo sur Sillon (citer la source ne suffit pas).
                </label>
                <SubmitButton variant="secondary" pendingLabel="Envoi…">Enregistrer la photo</SubmitButton>
              </ActionForm>
            </details>
            {sheet.cover_url ? (
              <form action={removePhoto} className="mt-3 text-right">
                <input type="hidden" name="id" value={sheet.id} />
                <button type="submit" className="text-sm text-danger hover:underline">Retirer la photo</button>
              </form>
            ) : null}
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">✦ Demander une correction à Claude</h2>
            <ActionForm action={askClaude}>
              <input type="hidden" name="id" value={sheet.id} />
              <Field label="Consigne" htmlFor="instruction" hint="Claude relit les mêmes sources (documents ou dossier de recherche web).">
                <Textarea id="instruction" name="instruction" rows={3} maxLength={1000} placeholder="Ex. : vérifie le poids dans le catalogue de pièces, page 2" />
              </Field>
              <SubmitButton variant="secondary" pendingLabel="Claude relit les documents…">Envoyer</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Sources</h2>
            <ul className="text-sm">
              {(sheet.sources ?? []).map((s) => (
                <li key={s.path ?? s.url ?? s.name} className="border-b border-[#eef0eb] py-2 last:border-0">
                  {s.url && /^https?:\/\//.test(s.url) ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-words text-brand hover:text-brand-dark">{s.name} ↗</a>
                  ) : (
                    s.name
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <form action={deleteSheet} className="text-right">
            <input type="hidden" name="id" value={sheet.id} />
            <button type="submit" className="text-sm text-danger hover:underline">Supprimer la fiche</button>
          </form>
        </aside>
      </div>
    </>
  );
}
