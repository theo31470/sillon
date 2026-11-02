import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getOwnListing } from '@/lib/bourse';
import { LISTING_STATUS, listingPath } from '@/lib/bourse-shared';
import { Notice } from '@/components/ui';
import { ListingForm } from '../listing-form';

export const metadata: Metadata = { title: 'Modifier l’annonce · Bourse' };

export default async function EditListingPage(props: PageProps<'/app/annonces/[id]'>) {
  const { id } = await props.params;
  const { session } = await requireUser(`/app/annonces/${id}`);
  const { enregistree } = await props.searchParams;
  const l = await getOwnListing(id, session.userId);
  if (!l) notFound();
  const published = l.status !== 'brouillon';
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Modifier l’annonce</h1>
          <p className="text-muted">
            {LISTING_STATUS[l.status]}
            {published && l.status !== 'moderee' ? (
              <>
                {' · '}
                <Link href={listingPath(l)} className="font-semibold text-brand-dark hover:underline">Voir l’annonce publique</Link>
              </>
            ) : null}
          </p>
        </div>
        <Link href="/app/annonces" className="font-semibold text-brand-dark hover:underline">← Mes annonces</Link>
      </div>
      {enregistree ? <Notice tone="green">Brouillon enregistré. Publiez-le quand vous êtes prêt.</Notice> : null}
      {l.status === 'moderee' ? <Notice tone="red">Annonce retirée par la modération{l.moderation_note ? ` : ${l.moderation_note}` : ''}. Elle ne peut plus être modifiée.</Notice> : null}
      {l.status !== 'moderee' ? (
        <ListingForm
          draft={{
            id: l.id,
            machine_id: l.machine_id,
            sheet_id: l.sheet_id,
            title: l.title,
            description: l.description,
            category: l.category,
            condition: l.condition,
            price: String(l.price_cents / 100).replace('.', ','),
            negotiable: l.negotiable,
            brand: l.brand,
            model: l.model,
            year: l.year ? String(l.year) : '',
            hours: l.hours !== null ? String(l.hours) : '',
            postal_code: l.postal_code,
            city: l.city,
            delivery: l.delivery,
            weight_kg: l.weight_kg !== null ? String(l.weight_kg).replace('.', ',') : '',
            shipping: l.shipping_cents !== null ? String(l.shipping_cents / 100).replace('.', ',') : '',
            photos: l.photos,
            published,
          }}
        />
      ) : null}
    </>
  );
}
