import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedBrands, listPublishedSheets } from '@/lib/content';
import { slugify } from '@/lib/format';
import { MachineScene, FurrowBand } from '@/components/sheets/machine-art';
import { Icon } from '@/components/sheets/icons';
import { SheetCard } from '@/components/sheets/sheet-card';
import { Badge, btn, Field, Input, inputClass } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { REQUEST_STATUSES, type SheetRequest } from '@/lib/sheet-requests';
import { requestSheet } from './demande-actions';
import { SHEET_CATEGORIES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Fiches techniques',
  description: 'Caractéristiques, entretien, pannes et pièces du matériel agricole. Fiches relues avant publication.',
};

export default async function SheetsPage(props: PageProps<'/fiches'>) {
  const { categorie, q } = await props.searchParams;
  const category = typeof categorie === 'string' && categorie in SHEET_CATEGORIES ? categorie : undefined;
  const search = typeof q === 'string' ? q.slice(0, 80) : undefined;
  const [sheets, brands] = await Promise.all([listPublishedSheets({ category, search }), listPublishedBrands()]);
  let loggedIn = false;
  let myRequests: Pick<SheetRequest, 'id' | 'brand' | 'model' | 'status' | 'admin_note' | 'sheet_id'>[] = [];
  try {
    loggedIn = Boolean(await getSession());
    if (loggedIn) {
      const { data } = await (await createClient()).from('sheet_requests').select('id, brand, model, status, admin_note, sheet_id').order('created_at', { ascending: false }).limit(10);
      myRequests = (data ?? []) as typeof myRequests;
    }
  } catch {
    /* base non configurée */
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 font-medium transition-all duration-200 ${active ? 'bg-brand text-on-brand shadow-[0_6px_16px_-8px_color-mix(in_srgb,var(--color-brand)_80%,transparent)]' : 'border border-field bg-surface text-ink hover:-translate-y-0.5 hover:border-brand hover:text-brand-dark'}`;

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-8 p-5 pb-8 sm:p-8 sm:pb-10">
            <div className="min-w-0 flex-[1_1_460px]">
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-brand">Base technique</p>
              <h1 className="mb-2 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Fiches techniques</h1>
              <p className="mb-6 text-[17px] text-muted">Caractéristiques, entretien, pannes et pièces pour votre matériel. Chaque fiche est relue avant publication.</p>
              <form role="search" className="flex flex-wrap gap-2.5">
                <label htmlFor="q" className="sr-only">Rechercher une fiche</label>
                <input id="q" name="q" type="search" defaultValue={search} placeholder="Ex. : tracteur 25 ch, motoculteur, herse…" className={`${inputClass} min-w-0 flex-[1_1_280px]`} />
                {category ? <input type="hidden" name="categorie" value={category} /> : null}
                <button type="submit" className={btn.primary}>Rechercher</button>
              </form>
            </div>
            <div className="h-48 min-w-0 flex-[0_1_360px] overflow-hidden rounded-2xl">
              <MachineScene kind="tracteur" uid="liste" label="Illustration : tracteur dans un champ labouré" className="hero-scene size-full" />
            </div>
          </div>
          <FurrowBand className="absolute inset-x-0 bottom-0 block h-4 w-full text-brand-soft" />
        </section>

        <nav aria-label="Catégories" className="flex flex-wrap gap-2">
          <Link href="/fiches" className={pill(!category)}>Toutes</Link>
          {Object.entries(SHEET_CATEGORIES).map(([key, label]) => (
            <Link key={key} href={`/fiches?categorie=${key}`} className={pill(category === key)}>
              {label}
            </Link>
          ))}
        </nav>

        {brands.length > 0 ? (
          <nav aria-label="Fiches par marque" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 font-semibold text-muted">Par marque :</span>
            {brands.map((b) => (
              <Link key={b.brand} href={`/fiches/marque/${slugify(b.brand)}`} className="rounded-full border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:border-brand hover:text-brand-dark">
                {b.brand} <span className="text-muted">{b.count}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-wrap items-start gap-6">
          <section className="min-w-0 flex-[3_1_600px]">
            {search ? (
              <p className="mb-4 text-muted">
                {sheets.length} résultat{sheets.length > 1 ? 's' : ''} pour « <span className="font-semibold text-ink">{search}</span> »
                {' · '}<Link href={category ? `/fiches?categorie=${category}` : '/fiches'} className="link-underline text-brand">effacer</Link>
              </p>
            ) : null}
            {sheets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-field bg-surface p-10 text-center text-muted">
                <Icon name="blade" size={32} className="text-wheat" />
                {search ? `Aucune fiche ne correspond à « ${search} ».` : 'Aucune fiche publiée pour le moment dans cette catégorie.'}
                <a href="#demande" className="link-underline font-semibold text-brand-dark">Demander une fiche</a>
              </div>
            ) : (
              <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
                {sheets.map((s, i) => (
                  <SheetCard key={s.id} sheet={s} index={i} />
                ))}
              </div>
            )}
          </section>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <section className="rounded-2xl bg-admin p-6 text-white">
              <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-admin-2 text-wheat">
                <Icon name="wrench" size={22} />
              </span>
              <h2 className="mb-2 text-lg font-semibold">Une machine en panne ?</h2>
              <p className="mb-4 text-[15px] text-panel-muted">Décrivez ce qui se passe : l’aide au diagnostic vous indique les causes possibles et quoi vérifier.</p>
              <Link href="/app/diagnostic" className={btn.primary}>Trouver la cause</Link>
            </section>
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-3 text-lg font-semibold">Ce que contient une fiche</h2>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                {[
                  ['gear', 'Caractéristiques techniques'],
                  ['wrench', 'Carnet d’entretien'],
                  ['warning', 'Pannes fréquentes'],
                  ['tag', 'Références des pièces'],
                ].map(([icon, label]) => (
                  <li key={label} className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon name={icon as 'gear'} size={17} /></span>
                    {label}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
        <section id="demande" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="mb-2 text-xl font-semibold">Il manque votre tracteur ?</h2>
              <p className="text-[15px] text-muted">
                Dites-nous la marque et le modèle : nous préparons sa fiche (caractéristiques, entretien, pannes, pièces) à partir de la documentation du constructeur et de la presse
                spécialisée, la relisons, puis vous prévenons par e-mail dès qu’elle est en ligne.
              </p>
              {myRequests.length ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold">Vos demandes</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {myRequests.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate">
                            {r.brand} {r.model}
                          </span>
                          {r.status === 'refusee' && r.admin_note ? <span className="block text-xs text-muted">{r.admin_note}</span> : null}
                        </span>
                        <Badge tone={r.status === 'publiee' ? 'green' : r.status === 'refusee' ? 'gray' : r.status === 'lancee' ? 'blue' : 'amber'}>{REQUEST_STATUSES[r.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {loggedIn ? (
              <ActionForm action={requestSheet} className="flex flex-col gap-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Marque" htmlFor="req-brand">
                    <Input id="req-brand" name="brand" required maxLength={60} placeholder="Ex. : Massey Ferguson" autoComplete="off" />
                  </Field>
                  <Field label="Modèle" htmlFor="req-model">
                    <Input id="req-model" name="model" required maxLength={120} placeholder="Ex. : 5713 S" autoComplete="off" />
                  </Field>
                </div>
                <Field label="Précisions (facultatif)" htmlFor="req-details" hint="Année, puissance, version : tout ce qui aide à trouver le bon modèle.">
                  <Input id="req-details" name="details" maxLength={300} placeholder="Ex. : 2016, 130 ch, Dyna-6" />
                </Field>
                <SubmitButton pendingLabel="Envoi…">Demander cette fiche</SubmitButton>
              </ActionForm>
            ) : (
              <div className="flex flex-col items-start justify-center gap-3 rounded-xl bg-ground p-5">
                <p className="text-[15px]">Créez un compte gratuit pour demander une fiche : nous vous écrivons dès qu’elle est prête.</p>
                <div className="flex flex-wrap gap-2.5">
                  <Link href="/inscription" className={btn.primary}>Créer un compte gratuit</Link>
                  <Link href="/connexion?suite=/fiches%23demande" className={btn.secondary}>Se connecter</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
