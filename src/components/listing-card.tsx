import Link from 'next/link';
import type { Listing } from '@/lib/bourse';
import { CATEGORY_SHORT, DEPARTMENTS, LISTING_CONDITIONS, listingPath, priceLabel } from '@/lib/bourse-shared';

const ago = (iso: string | null) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 30) return `Il y a ${days} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
};

/** Carte d'annonce de la bourse (liste, favoris, annonces similaires). */
export function ListingCard({ l }: { l: Listing }) {
  const cover = l.photos[0];
  return (
    <Link href={listingPath(l)} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg">
      <span className="relative block aspect-[4/3] overflow-hidden bg-ground">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo envoyée par le vendeur
          <img src={cover.url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : null}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{CATEGORY_SHORT[l.category]}</span>
        {l.status === 'reservee' ? <span className="absolute right-2 top-2 rounded-full bg-wheat px-2.5 py-1 text-[11px] font-bold text-admin">Réservée</span> : null}
        {l.photos.length > 1 ? <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{l.photos.length} photos</span> : null}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <span className="line-clamp-2 font-semibold leading-snug">{l.title}</span>
        <span className="font-display text-xl font-bold text-brand-dark">{priceLabel(l.price_cents)}</span>
        <span className="text-sm text-muted">
          {[LISTING_CONDITIONS[l.condition], l.year ? String(l.year) : null, l.hours ? `${Math.round(Number(l.hours)).toLocaleString('fr-FR')} h` : null].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted">
          <span className="truncate">{l.city} ({DEPARTMENTS[l.department] ? l.department : l.department})</span>
          <span className="flex-none">{ago(l.published_at)}</span>
        </span>
        {l.delivery !== 'main_propre' ? <span className="text-xs font-semibold text-success">Envoi possible</span> : null}
      </span>
    </Link>
  );
}
