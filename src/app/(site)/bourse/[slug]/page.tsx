import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { after } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { countView, getListingByRef, searchListings, sellerCard } from '@/lib/bourse';
import { securePaymentBlocker } from '@/lib/bourse-pay';
import { BUYER_FEE, CATEGORY_SHORT, DELIVERY_LABELS, DEPARTMENTS, LISTING_CATEGORIES, LISTING_CONDITIONS, LISTING_STATUS, listingPath, priceLabel, refFromSlug } from '@/lib/bourse-shared';
import { formatDate } from '@/lib/format';
import { env } from '@/lib/env';
import { JsonLd } from '@/components/json-ld';
import { ListingCard } from '@/components/listing-card';
import { Badge, btn } from '@/components/ui';
import { ContactBox, FavoriteButton, Gallery, ReportBox } from './listing-bits';

async function load(slug: string) {
  const ref = refFromSlug(slug);
  return ref ? getListingByRef(ref) : null;
}

export async function generateMetadata(props: PageProps<'/bourse/[slug]'>): Promise<Metadata> {
  const l = await load((await props.params).slug);
  if (!l) return { title: 'Annonce introuvable' };
  const place = `${l.city} (${l.department})`;
  return {
    title: `${l.title} · ${priceLabel(l.price_cents)} · ${place}`,
    description: `${l.title} d’occasion à ${priceLabel(l.price_cents)}, ${LISTING_CONDITIONS[l.condition].toLowerCase()}, ${place}. ${l.description.slice(0, 120)}`,
    alternates: { canonical: listingPath(l) },
    openGraph: l.photos[0] ? { images: [{ url: l.photos[0].url }] } : undefined,
    robots: l.status === 'vendue' ? { index: false } : undefined,
  };
}

export default async function ListingPage(props: PageProps<'/bourse/[slug]'>) {
  const { slug } = await props.params;
  const l = await load(slug);
  if (!l) notFound();
  // Titre modifié : l'ancienne adresse renvoie vers la bonne.
  const canonical = listingPath(l);
  if (`/bourse/${slug}` !== canonical) permanentRedirect(canonical);

  const session = await getSession().catch(() => null);
  const mine = session?.userId === l.seller_id;
  const [seller, favorite, similar, sheet, blocker] = await Promise.all([
    sellerCard(l.seller_id),
    session && !mine
      ? (await createClient()).from('listing_favorites').select('listing_id').eq('listing_id', l.id).maybeSingle().then((r) => Boolean(r.data))
      : Promise.resolve(false),
    searchListings({ category: l.category, page: 1 }).then((r) => r.listings.filter((x) => x.id !== l.id).slice(0, 4)),
    l.sheet_id ? (await createClient()).from('tech_sheets').select('slug, title').eq('id', l.sheet_id).eq('status', 'published').maybeSingle().then((r) => r.data) : Promise.resolve(null),
    mine ? Promise.resolve('mine') : securePaymentBlocker(l).catch(() => 'indisponible'),
  ]);
  const buyable = !blocker && (l.delivery === 'main_propre' || l.delivery === 'les_deux' || l.shipping_cents !== null);
  const buyPath = `/app/acheter/${l.ref}`;
  const feeHint = `Paiement sécurisé · frais de service ${(BUYER_FEE.fixed / 100).toFixed(2).replace('.', ',')} € + ${BUYER_FEE.rate * 100} % à la charge de l’acheteur`;
  if (!mine) after(() => countView(l.id, l.views));

  const site = env.siteUrl().replace(/\/$/, '');
  const specs = [
    ['Catégorie', LISTING_CATEGORIES[l.category]],
    ['État', LISTING_CONDITIONS[l.condition]],
    ['Marque', l.brand],
    ['Modèle', l.model],
    ['Année', l.year ? String(l.year) : ''],
    ['Heures', l.hours !== null ? `${Math.round(Number(l.hours)).toLocaleString('fr-FR')} h` : ''],
    ['Remise', DELIVERY_LABELS[l.delivery]],
    ['Poids du colis', l.weight_kg ? `${String(l.weight_kg).replace('.', ',')} kg` : ''],
  ].filter(([, v]) => v);
  const closed = l.status === 'vendue';

  return (
    <div className="bg-ground">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: l.title,
          description: l.description.slice(0, 500),
          image: l.photos.map((p) => p.url),
          ...(l.brand ? { brand: { '@type': 'Brand', name: l.brand } } : {}),
          ...(l.model ? { model: l.model } : {}),
          offers: {
            '@type': 'Offer',
            price: (l.price_cents / 100).toFixed(2),
            priceCurrency: 'EUR',
            itemCondition: l.condition === 'neuf' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
            availability: closed ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
            url: `${site}${canonical}`,
            areaServed: { '@type': 'Country', name: 'France' },
          },
        }}
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <Link href="/bourse" className="hover:text-ink">Bourse</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/bourse?categorie=${l.category}`} className="hover:text-ink">{CATEGORY_SHORT[l.category]}</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/bourse?dep=${l.department}`} className="hover:text-ink">{DEPARTMENTS[l.department] ?? l.department}</Link>
        </nav>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-7">
          <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
            <Gallery photos={l.photos} title={l.title} />
          </div>
          <div className="order-3 flex min-w-0 flex-col gap-5 lg:order-none lg:col-start-1 lg:row-start-2">

            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="mb-3 text-xl font-semibold">Description</h2>
              {l.description ? <p className="whitespace-pre-line leading-relaxed">{l.description}</p> : <p className="text-muted">Pas de description.</p>}
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="mb-3 text-xl font-semibold">Caractéristiques</h2>
              <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {specs.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line-soft pb-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              {sheet ? (
                <Link href={`/fiches/${sheet.slug}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-tint px-4 py-3 text-sm font-semibold text-brand-dark hover:underline">
                  Fiche technique complète : {sheet.title} →
                </Link>
              ) : null}
            </section>
          </div>

          <aside className="order-2 flex min-w-0 flex-col gap-4 self-start lg:order-none lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <Badge tone="gray">{LISTING_CONDITIONS[l.condition]}</Badge>
                {l.delivery !== 'main_propre' ? <Badge tone="green">Envoi possible</Badge> : <Badge tone="gray">Main propre</Badge>}
                {l.status !== 'en_ligne' ? <Badge tone="amber">{LISTING_STATUS[l.status]}</Badge> : null}
              </div>
              <h1 className="font-display text-[clamp(24px,2.6vw,30px)] font-bold leading-tight tracking-tight">{l.title}</h1>
              <p className="font-display text-4xl font-bold text-brand-dark">
                {priceLabel(l.price_cents)}
                {l.negotiable ? <span className="ml-2 align-middle text-sm font-semibold text-muted">à débattre</span> : null}
              </p>
              <p className="text-sm text-muted">
                {l.city} ({l.department}) · publiée le {formatDate(l.published_at ?? l.created_at, { day: 'numeric', month: 'long', year: 'numeric' })} · {l.views + 1} vue{l.views ? 's' : ''}
              </p>

              {closed ? (
                <p className="rounded-xl bg-ground px-4 py-3 text-sm">Ce matériel a été vendu.</p>
              ) : mine ? (
                <div className="flex flex-col gap-2 rounded-xl bg-ground p-3 text-sm">
                  <p>C’est votre annonce.</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/app/annonces/${l.id}`} className={btn.small}>Modifier</Link>
                    <Link href="/app/annonces" className={btn.small}>Mes annonces</Link>
                  </div>
                </div>
              ) : session ? (
                <>
                  {buyable ? (
                    <Link href={buyPath} className={btn.primary}>
                      <LockIcon /> Acheter
                    </Link>
                  ) : null}
                  <ContactBox listingId={l.id} refCode={l.ref} sellerName={seller?.name ?? 'le vendeur'} />
                  <FavoriteButton listingId={l.id} initial={favorite} />
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  {buyable ? (
                    <Link href={`/connexion?suite=${encodeURIComponent(buyPath)}`} className={btn.primary}>
                      <LockIcon /> Acheter
                    </Link>
                  ) : null}
                  <Link href={`/connexion?suite=${encodeURIComponent(canonical)}`} className={buyable ? btn.secondary : btn.primary}>Se connecter pour contacter le vendeur</Link>
                  <Link href={`/inscription?suite=${encodeURIComponent(canonical)}`} className={btn.secondary}>Créer un compte gratuit</Link>
                </div>
              )}
              {!closed && !mine ? (
                buyable ? (
                  <p className="text-xs text-muted">{feeHint}. Le vendeur n’est payé qu’une fois le matériel entre vos mains.</p>
                ) : (
                  <p className="text-xs text-muted">Paiement sécurisé pas encore activé par ce vendeur : convenez du règlement par la messagerie.</p>
                )
              ) : null}
            </section>

            {seller ? (
              <section className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <span className="flex size-12 flex-none items-center justify-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand-dark">{seller.name.slice(0, 1)}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{seller.name}</span>
                  <span className="text-sm text-muted">
                    Membre depuis {formatDate(seller.since, { month: 'long', year: 'numeric', day: undefined })}
                    {seller.sold ? ` · ${seller.sold} vente${seller.sold > 1 ? 's' : ''}` : ''}
                    {seller.online > 1 ? ` · ${seller.online} annonces en ligne` : ''}
                  </span>
                </span>
              </section>
            ) : null}

            <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="mb-1.5 font-semibold">Achetez en toute sécurité</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                <li>Échangez par la messagerie du site, sans donner vos coordonnées.</li>
                <li>Pour une machine, voyez-la tourner avant d’acheter.</li>
                <li>Payez sur le site avec le paiement sécurisé : le vendeur n’est payé qu’après la remise ou la réception.</li>
                <li>Refusez tout paiement par mandat, coupon ou virement à l’étranger.</li>
              </ul>
              {session && !mine ? (
                <div className="mt-3">
                  <ReportBox listingId={l.id} />
                </div>
              ) : null}
            </section>
          </aside>
        </div>

        {similar.length ? (
          <section className="flex flex-col gap-3 pt-4">
            <h2 className="text-xl font-semibold">Autres annonces · {CATEGORY_SHORT[l.category]}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
              {similar.map((s) => (
                <li key={s.id}>
                  <ListingCard l={s} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
