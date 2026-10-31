import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listBrandSheets, listPublishedBrands } from '@/lib/content';
import { slugify } from '@/lib/format';
import { env } from '@/lib/env';
import { SheetCard } from '@/components/sheets/sheet-card';
import { FurrowBand } from '@/components/sheets/machine-art';
import { JsonLd } from '@/components/json-ld';

async function brandOf(param: string) {
  const brands = await listPublishedBrands();
  return brands.find((b) => slugify(b.brand) === param) ?? null;
}

export async function generateMetadata(props: PageProps<'/fiches/marque/[marque]'>): Promise<Metadata> {
  const { marque } = await props.params;
  const b = await brandOf(marque);
  if (!b) return { title: 'Marque introuvable' };
  return {
    title: `Fiches techniques ${b.brand} : entretien, pannes, caractéristiques`,
    description: `${b.count} fiche${b.count > 1 ? 's' : ''} technique${b.count > 1 ? 's' : ''} de tracteurs ${b.brand} : caractéristiques, intervalles d’entretien, pannes fréquentes et pièces. Relues avant publication.`,
    alternates: { canonical: `/fiches/marque/${marque}` },
  };
}

export default async function BrandPage(props: PageProps<'/fiches/marque/[marque]'>) {
  const { marque } = await props.params;
  const b = await brandOf(marque);
  if (!b) notFound();
  const sheets = await listBrandSheets(b.brand);
  if (!sheets.length) notFound();

  // Regroupement par série, séries triées par puissance croissante.
  const groups = new Map<string, typeof sheets>();
  for (const s of sheets) groups.set(s.series, [...(groups.get(s.series) ?? []), s]);
  const minPower = (list: typeof sheets) => Math.min(...list.map((s) => s.power ?? 9999));
  const ordered = [...groups].sort(([a, la], [bb, lb]) => (a === '' ? 1 : bb === '' ? -1 : minPower(la) - minPower(lb) || a.localeCompare(bb, 'fr')));
  for (const [, list] of ordered) list.sort((x, y) => (x.power ?? 9999) - (y.power ?? 9999) || x.title.localeCompare(y.title, 'fr'));

  const site = env.siteUrl().replace(/\/$/, '');
  let index = 0;

  return (
    <div className="bg-ground">
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Fiches techniques', item: `${site}/fiches` },
              { '@type': 'ListItem', position: 2, name: b.brand, item: `${site}/fiches/marque/${marque}` },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `Fiches techniques ${b.brand}`,
            numberOfItems: sheets.length,
            itemListElement: sheets.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/fiches/${s.slug}`, name: s.title })),
          },
        ]}
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-10">
        <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/fiches" className="link-underline text-brand" transitionTypes={['nav-back']}>
            Fiches techniques
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{b.brand}</span>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 pb-9 sm:p-8 sm:pb-11">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-brand">Marque</p>
          <h1 className="mb-2 text-[clamp(30px,3.4vw,40px)] font-bold tracking-tight">Fiches techniques {b.brand}</h1>
          <p className="max-w-3xl text-[17px] text-muted">
            {sheets.length} tracteur{sheets.length > 1 ? 's' : ''} {b.brand} : caractéristiques, intervalles d’entretien, pannes fréquentes et pièces, d’après la documentation du
            constructeur et la presse spécialisée. Chaque fiche est relue par l’équipe avant publication.
          </p>
          <FurrowBand className="absolute inset-x-0 bottom-0 block h-4 w-full text-brand-soft" />
        </section>

        {ordered.map(([series, list]) => (
          <section key={series || 'autres'} aria-labelledby={`serie-${slugify(series || 'autres')}`} className="flex flex-col gap-4">
            <h2 id={`serie-${slugify(series || 'autres')}`} className="text-2xl font-bold tracking-tight">
              {series ? `${b.brand} ${series}` : ordered.length > 1 ? `Autres ${b.brand}` : `Tracteurs ${b.brand}`}
              <span className="ml-2 text-base font-normal text-muted">{list.length} modèle{list.length > 1 ? 's' : ''}</span>
            </h2>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
              {list.map((s) => (
                <SheetCard key={s.id} sheet={s} index={index++} headingLevel="h3" />
              ))}
            </div>
          </section>
        ))}

        <p className="text-sm text-muted">
          Il manque un modèle ? <Link href="/fiches#demande" className="link-underline font-semibold text-brand-dark">Demandez sa fiche</Link> : nous la préparons et vous prévenons dès
          qu’elle est en ligne.
        </p>
      </div>
    </div>
  );
}
