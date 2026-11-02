import Link from 'next/link';
import type { Metadata } from 'next';
import { searchListings, PAGE_SIZE, type ListingFilters } from '@/lib/bourse';
import { CATEGORY_SHORT, DEPARTMENTS, LISTING_CATEGORIES, type ListingCategory } from '@/lib/bourse-shared';
import { ListingCard } from '@/components/listing-card';
import { FurrowBand } from '@/components/sheets/machine-art';
import { btn, inputClass } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Bourse au matériel agricole : annonces entre agriculteurs',
  description: 'Tracteurs, outils, pièces et pneus d’occasion entre agriculteurs. Annonces gratuites, messagerie protégée, paiement sécurisé et envoi par Colissimo, Mondial Relay ou Chronopost.',
  alternates: { canonical: '/bourse' },
};

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function BoursePage(props: PageProps<'/bourse'>) {
  const sp = await props.searchParams;
  const category = one(sp.categorie);
  const department = one(sp.dep);
  const filters: ListingFilters = {
    q: one(sp.q)?.slice(0, 80),
    category: category && category in LISTING_CATEGORIES ? (category as ListingCategory) : null,
    department: department && department in DEPARTMENTS ? department : null,
    delivery: one(sp.remise) === 'envoi' ? 'envoi' : one(sp.remise) === 'main_propre' ? 'main_propre' : null,
    min: Number(one(sp.min)) || null,
    max: Number(one(sp.max)) || null,
    sort: one(sp.tri) === 'prix_asc' ? 'prix_asc' : one(sp.tri) === 'prix_desc' ? 'prix_desc' : 'recent',
    page: Number(one(sp.page)) || 1,
  };
  const { listings, total, page } = await searchListings(filters);
  const pages = Math.ceil(total / PAGE_SIZE);
  const params = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null | undefined> = {
      q: filters.q,
      categorie: filters.category,
      dep: filters.department,
      remise: filters.delivery,
      min: filters.min ? String(filters.min) : null,
      max: filters.max ? String(filters.max) : null,
      tri: filters.sort === 'recent' ? null : filters.sort,
      ...patch,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/bourse?${s}` : '/bourse';
  };
  const pill = (active: boolean) =>
    `flex-none rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${active ? 'bg-brand text-on-brand' : 'border border-field bg-surface hover:border-brand hover:text-brand-dark'}`;
  const filtered = Boolean(filters.q || filters.category || filters.department || filters.delivery || filters.min || filters.max);

  return (
    <div className="bg-ground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="relative overflow-hidden rounded-3xl bg-admin text-white">
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-6 p-6 pb-10 sm:p-9 sm:pb-12">
            <div className="min-w-0 flex-[1_1_480px]">
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-[#f2a878]">Bourse au matériel</p>
              <h1 className="font-display text-[clamp(30px,4vw,46px)] font-bold leading-[1.05] tracking-tight">Le matériel agricole d’occasion, entre agriculteurs</h1>
              <p className="mt-3 max-w-2xl text-[17px] text-panel-muted">
                Tracteurs, outils, pièces et pneus. Annonces gratuites, messagerie protégée, paiement sécurisé et envoi en point relais.
              </p>
              <form role="search" action="/bourse" className="mt-5 flex flex-wrap gap-2.5">
                <label htmlFor="bourse-q" className="sr-only">Rechercher</label>
                <input id="bourse-q" name="q" type="search" defaultValue={filters.q} placeholder="Ex. : herse rotative, pneu 650/65 R38, Fendt 312…" className={`${inputClass} min-w-0 flex-[1_1_280px] text-ink`} />
                {filters.category ? <input type="hidden" name="categorie" value={filters.category} /> : null}
                {filters.department ? <input type="hidden" name="dep" value={filters.department} /> : null}
                <button type="submit" className={btn.primary}>Rechercher</button>
              </form>
            </div>
            <Link href="/app/annonces/nouvelle" className="btn inline-flex min-h-12 items-center rounded-[10px] bg-white px-5 font-semibold text-admin hover:bg-[#f3efe9]">
              + Déposer une annonce gratuite
            </Link>
          </div>
          <FurrowBand className="absolute inset-x-0 bottom-0 h-8 text-white/10" />
        </section>

        {/* Catégories */}
        <nav aria-label="Catégories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link href={params({ categorie: null, page: null })} className={pill(!filters.category)}>Tout</Link>
          {(Object.keys(CATEGORY_SHORT) as ListingCategory[]).map((c) => (
            <Link key={c} href={params({ categorie: c, page: null })} className={pill(filters.category === c)}>{CATEGORY_SHORT[c]}</Link>
          ))}
        </nav>

        {/* Filtres */}
        <form action="/bourse" className="grid grid-cols-2 gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:flex sm:flex-wrap sm:items-end">
          {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
          {filters.category ? <input type="hidden" name="categorie" value={filters.category} /> : null}
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold sm:w-56">
            Département
            <select name="dep" defaultValue={filters.department ?? ''} className={`${inputClass} min-h-11 py-2`}>
              <option value="">Toute la France</option>
              {Object.entries(DEPARTMENTS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold sm:w-48">
            Remise
            <select name="remise" defaultValue={filters.delivery ?? ''} className={`${inputClass} min-h-11 py-2`}>
              <option value="">Envoi ou main propre</option>
              <option value="envoi">Envoi possible</option>
              <option value="main_propre">Main propre</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:w-28">
            Prix min (€)
            <input name="min" inputMode="numeric" defaultValue={filters.min ?? ''} className={`${inputClass} min-h-11 py-2`} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:w-28">
            Prix max (€)
            <input name="max" inputMode="numeric" defaultValue={filters.max ?? ''} className={`${inputClass} min-h-11 py-2`} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold sm:w-44">
            Trier par
            <select name="tri" defaultValue={filters.sort === 'recent' ? '' : filters.sort} className={`${inputClass} min-h-11 py-2`}>
              <option value="">Plus récentes</option>
              <option value="prix_asc">Prix croissant</option>
              <option value="prix_desc">Prix décroissant</option>
            </select>
          </label>
          <button type="submit" className={`${btn.secondary} col-span-2 min-h-11 sm:col-span-1`}>Filtrer</button>
          {filtered ? <Link href="/bourse" className="col-span-2 self-center text-center text-sm font-semibold text-brand-dark hover:underline sm:col-span-1">Effacer</Link> : null}
        </form>

        <p className="text-sm text-muted">
          {total === 0 ? 'Aucune annonce' : `${total.toLocaleString('fr-FR')} annonce${total > 1 ? 's' : ''}`}
          {filters.category ? ` · ${CATEGORY_SHORT[filters.category]}` : ''}
          {filters.department ? ` · ${DEPARTMENTS[filters.department]}` : ''}
        </p>

        {listings.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5">
            {listings.map((l) => (
              <li key={l.id}>
                <ListingCard l={l} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-field bg-surface px-6 py-14 text-center">
            <p className="font-display text-2xl font-bold">{filtered ? 'Rien pour cette recherche… pour l’instant' : 'La bourse vient d’ouvrir'}</p>
            <p className="max-w-lg text-muted">
              {filtered
                ? 'Élargissez la zone ou la catégorie, ou revenez bientôt : de nouvelles annonces arrivent chaque jour.'
                : 'Soyez parmi les premiers à proposer votre matériel : c’est gratuit, et vos annonces seront vues par tous les agriculteurs du site.'}
            </p>
            <Link href="/app/annonces/nouvelle" className={btn.primary}>Déposer une annonce</Link>
          </div>
        )}

        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-center gap-2">
            {page > 1 ? <Link href={params({ page: String(page - 1) })} className={btn.small}>← Précédente</Link> : null}
            <span className="px-3 text-sm text-muted">Page {page} sur {pages}</span>
            {page < pages ? <Link href={params({ page: String(page + 1) })} className={btn.small}>Suivante →</Link> : null}
          </nav>
        ) : null}

        <section className="grid gap-4 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-3 sm:p-8">
          {[
            ['Annonces gratuites', 'Publiez en deux minutes depuis votre téléphone. Depuis votre parc, le prix de revente est estimé pour vous.'],
            ['Messagerie protégée', 'Échangez sans donner votre numéro ni votre e-mail. Méfiez-vous de toute demande de paiement hors du site.'],
            ['Paiement et envoi sécurisés', 'L’argent est versé au vendeur une fois le colis reçu. Bordereau Colissimo, Mondial Relay ou Chronopost en un clic.'],
          ].map(([t, d]) => (
            <div key={t}>
              <p className="font-display text-lg font-bold">{t}</p>
              <p className="text-sm text-muted">{d}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
