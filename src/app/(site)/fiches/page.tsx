import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedSheets } from '@/lib/content';
import { PhotoSlot, btn, inputClass } from '@/components/ui';
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

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-10">
        <section className="flex flex-wrap items-center gap-8 rounded-2xl border border-line bg-white p-8">
          <div className="min-w-0 flex-[1_1_460px]">
            <h1 className="mb-2 text-3xl font-bold tracking-tight">Fiches techniques</h1>
            <p className="mb-5 text-[17px] text-muted">Caractéristiques, entretien, pannes et pièces pour votre matériel. Chaque fiche est relue avant publication.</p>
            <form role="search" className="flex flex-wrap gap-2.5">
              <label htmlFor="q" className="sr-only">Rechercher une fiche</label>
              <input id="q" name="q" type="search" defaultValue={search} placeholder="Ex. : tracteur 25 ch, motoculteur, herse…" className={`${inputClass} min-w-0 flex-[1_1_280px]`} />
              {category ? <input type="hidden" name="categorie" value={category} /> : null}
              <button type="submit" className={btn.primary}>Rechercher</button>
            </form>
          </div>
          <PhotoSlot label="Photo : hangar avec plusieurs machines alignées" className="h-48 min-w-0 flex-[0_1_340px]" />
        </section>

        <nav aria-label="Catégories" className="flex flex-wrap gap-2">
          <Link href="/fiches" className={`rounded-full px-4 py-2 ${!category ? 'bg-brand font-semibold text-white' : 'border border-field bg-white'}`}>Toutes</Link>
          {Object.entries(SHEET_CATEGORIES).map(([key, label]) => (
            <Link key={key} href={`/fiches?categorie=${key}`} className={`rounded-full px-4 py-2 ${category === key ? 'bg-brand font-semibold text-white' : 'border border-field bg-white'}`}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-start gap-6">
          <section className="min-w-0 flex-[3_1_600px]">
            {sheets.length === 0 ? (
              <p className="rounded-2xl border border-line bg-white p-10 text-center text-muted">
                Aucune fiche publiée pour le moment dans cette catégorie.
              </p>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                {sheets.map((s) => (
                  <Link key={s.id} href={`/fiches/${s.slug}`} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink hover:border-brand">
                    <PhotoSlot label={`Photo : ${s.title}`} className="h-40 rounded-none" />
                    <div className="p-4">
                      <h2 className="mb-1.5 font-semibold">{s.title}</h2>
                      <p className="line-clamp-2 text-sm text-muted">{s.summary || [s.brand, s.model].filter(Boolean).join(' ')}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <section className="rounded-2xl border border-line bg-white p-6">
              <h2 className="mb-2 text-lg font-semibold">Une machine en panne ?</h2>
              <p className="mb-4 text-[15px] text-muted">Décrivez ce qui se passe : l’aide au diagnostic vous indique les causes possibles et quoi vérifier.</p>
              <Link href="/app/diagnostic" className={btn.primary}>Trouver la cause</Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
