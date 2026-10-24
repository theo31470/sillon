import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedSheets } from '@/lib/content';
import { parseSheetContent } from '@/lib/sheets/schema';
import { keyFigures, machineKind, MACHINE_KIND_LABELS } from '@/lib/sheets/insights';
import { MachineScene, FurrowBand } from '@/components/sheets/machine-art';
import { FIGURE_ICONS, Icon } from '@/components/sheets/icons';
import { btn, inputClass } from '@/components/ui';
import { SHEET_CATEGORIES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Fiches techniques',
  description: 'Caractéristiques, entretien, pannes et pièces du matériel agricole. Fiches relues avant publication.',
};

export default async function SheetsPage(props: PageProps<'/fiches'>) {
  const { categorie, q } = await props.searchParams;
  const category = typeof categorie === 'string' && categorie in SHEET_CATEGORIES ? categorie : undefined;
  const search = typeof q === 'string' ? q.slice(0, 80) : undefined;
  const sheets = await listPublishedSheets({ category, search });

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 font-medium transition-all duration-200 ${active ? 'bg-brand text-white shadow-[0_6px_16px_-8px_rgba(47,109,58,0.8)]' : 'border border-field bg-white text-ink hover:-translate-y-0.5 hover:border-brand hover:text-brand-dark'}`;

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-line bg-white">
          <div className="flex flex-wrap items-center gap-8 p-8 pb-10">
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

        <div className="flex flex-wrap items-start gap-6">
          <section className="min-w-0 flex-[3_1_600px]">
            {search ? (
              <p className="mb-4 text-muted">
                {sheets.length} résultat{sheets.length > 1 ? 's' : ''} pour « <span className="font-semibold text-ink">{search}</span> »
                {' · '}<Link href={category ? `/fiches?categorie=${category}` : '/fiches'} className="link-underline text-brand">effacer</Link>
              </p>
            ) : null}
            {sheets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-field bg-white p-10 text-center text-muted">
                <Icon name="blade" size={32} className="text-wheat" />
                Aucune fiche publiée pour le moment dans cette catégorie.
              </div>
            ) : (
              <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
                {sheets.map((s, i) => {
                  const kind = machineKind(s);
                  const figures = keyFigures(parseSheetContent(s.content), 2);
                  return (
                    <Link
                      key={s.id}
                      href={`/fiches/${s.slug}`}
                      transitionTypes={['nav-forward']}
                      className="sheet-card reveal group flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink"
                      style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                    >
                      <div className="relative h-44 overflow-hidden bg-photo">
                        {s.cover_url ? (
                          <Image src={s.cover_url} alt="" fill sizes="(min-width: 768px) 320px, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <MachineScene kind={kind} uid={s.id} label="" className="size-full" />
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-brand-dark backdrop-blur">
                          {MACHINE_KIND_LABELS[kind]}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 p-4">
                        {s.brand ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{s.brand}</p> : null}
                        <h2 className="text-lg font-semibold leading-snug">{s.title}</h2>
                        {figures.length > 0 ? (
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {figures.map((f) => (
                              <li key={f.key} className="inline-flex items-center gap-1 rounded-full bg-wheat-soft px-2.5 py-1 text-[13px] font-semibold text-soil">
                                <Icon name={FIGURE_ICONS[f.key] ?? 'gear'} size={14} /> {f.main}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="line-clamp-2 text-sm text-muted">{s.summary}</p>
                        )}
                        <p className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-brand">
                          Ouvrir la fiche <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <section className="rounded-2xl bg-admin p-6 text-white">
              <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[#26302a] text-[#d9b45a]">
                <Icon name="wrench" size={22} />
              </span>
              <h2 className="mb-2 text-lg font-semibold">Une machine en panne ?</h2>
              <p className="mb-4 text-[15px] text-[#b9c7bd]">Décrivez ce qui se passe : l’aide au diagnostic vous indique les causes possibles et quoi vérifier.</p>
              <Link href="/app/diagnostic" className="btn-light inline-flex min-h-12 items-center rounded-[10px] bg-white px-5 py-3 font-semibold text-brand-dark">Trouver la cause</Link>
            </section>
            <section className="rounded-2xl border border-line bg-white p-6">
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
      </div>
    </div>
  );
}
