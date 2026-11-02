import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Listing } from '@/lib/bourse';
import { LISTING_STATUS, listingPath, priceLabel } from '@/lib/bourse-shared';
import { formatDate } from '@/lib/format';
import { Badge, Card, Notice, btn } from '@/components/ui';
import { deleteListing, setListingStatus } from './actions';

export const metadata: Metadata = { title: 'Mes annonces · Bourse' };

const TONE: Record<Listing['status'], 'green' | 'amber' | 'gray' | 'red' | 'blue'> = {
  brouillon: 'gray',
  en_ligne: 'green',
  reservee: 'amber',
  vendue: 'blue',
  retiree: 'gray',
  moderee: 'red',
};

export default async function MyListingsPage(props: PageProps<'/app/annonces'>) {
  const { session } = await requireUser('/app/annonces');
  const { publiee, supprimee } = await props.searchParams;
  const supabase = await createClient();
  const [{ data: rows }, { data: favRows }, { data: convs }] = await Promise.all([
    supabase.from('listings').select('*').eq('seller_id', session.userId).order('created_at', { ascending: false }),
    supabase.from('listing_favorites').select('listing_id, listings(*)').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(30),
    supabase.from('listing_conversations').select('id, listing_id, buyer_id, seller_id, last_message_at, buyer_read_at, seller_read_at').or(`buyer_id.eq.${session.userId},seller_id.eq.${session.userId}`),
  ]);
  const mine = (rows ?? []) as Listing[];
  const favorites = ((favRows ?? []) as unknown as { listings: Listing | null }[]).map((f) => f.listings).filter((l): l is Listing => Boolean(l));
  const unread = (convs ?? []).filter((c) => {
    const readAt = c.buyer_id === session.userId ? c.buyer_read_at : c.seller_read_at;
    return !readAt || readAt < c.last_message_at;
  }).length;
  const messagesFor = (id: string) => (convs ?? []).filter((c) => c.listing_id === id && c.seller_id === session.userId).length;
  const published = publiee ? mine.find((l) => l.ref === publiee) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mes annonces</h1>
          <p className="text-muted">Vendez votre matériel entre agriculteurs : annonces gratuites, messagerie protégée.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/messages" className={btn.secondary}>
            Messages{unread ? <span className="rounded-full bg-brand px-2 text-sm text-on-brand">{unread}</span> : null}
          </Link>
          <Link href="/app/annonces/nouvelle" className={btn.primary}>+ Déposer une annonce</Link>
        </div>
      </div>

      {published ? (
        <Notice tone="green">
          Votre annonce est en ligne !{' '}
          <Link href={listingPath(published)} className="font-semibold underline underline-offset-4">Voir l’annonce</Link>
        </Notice>
      ) : null}
      {supprimee ? <Notice tone="gray">Annonce supprimée.</Notice> : null}

      {mine.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-xl font-semibold">Aucune annonce pour le moment</h2>
          <p className="max-w-2xl text-muted">
            Un outil qui dort au fond du hangar, des pneus en trop, une machine à renouveler ? Déposez une annonce en deux minutes, c’est gratuit. Depuis la page d’une machine de votre
            parc, le bouton « Mettre en vente » remplit tout pour vous, avec le prix de revente estimé.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/annonces/nouvelle" className={btn.primary}>Déposer une annonce</Link>
            <Link href="/bourse" className={btn.secondary}>Voir la bourse</Link>
          </div>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {mine.map((l) => {
            const cover = l.photos[0]?.url;
            const live = ['en_ligne', 'reservee', 'vendue'].includes(l.status);
            const n = messagesFor(l.id);
            return (
              <li key={l.id}>
                <Card className="flex flex-wrap items-center gap-4 p-3 sm:p-4">
                  <Link href={`/app/annonces/${l.id}`} className="size-20 flex-none overflow-hidden rounded-xl bg-ground sm:size-24">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
                      <img src={cover} alt="" className="size-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-[1_1_220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[l.status]}>{LISTING_STATUS[l.status]}</Badge>
                      {n ? <span className="text-sm text-muted">{n} conversation{n > 1 ? 's' : ''}</span> : null}
                    </div>
                    <p className="mt-1 truncate font-semibold">{l.title}</p>
                    <p className="text-sm text-muted">
                      {priceLabel(l.price_cents)} · {l.views} vue{l.views > 1 ? 's' : ''} · {l.published_at ? `publiée le ${formatDate(l.published_at)}` : `créée le ${formatDate(l.created_at)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {live ? <Link href={listingPath(l)} className={btn.small}>Voir</Link> : null}
                    {l.status !== 'moderee' ? <Link href={`/app/annonces/${l.id}`} className={btn.small}>Modifier</Link> : null}
                    {l.status === 'en_ligne' ? (
                      <>
                        <StatusButton id={l.id} status="reservee" label="Réservée" />
                        <StatusButton id={l.id} status="vendue" label="Vendue" />
                      </>
                    ) : null}
                    {l.status === 'reservee' ? (
                      <>
                        <StatusButton id={l.id} status="en_ligne" label="Remettre en vente" />
                        <StatusButton id={l.id} status="vendue" label="Vendue" />
                      </>
                    ) : null}
                    {l.status === 'retiree' ? <StatusButton id={l.id} status="en_ligne" label="Remettre en ligne" /> : null}
                    {['en_ligne', 'reservee'].includes(l.status) ? <StatusButton id={l.id} status="retiree" label="Retirer" /> : null}
                    <details className="relative">
                      <summary className="cursor-pointer list-none px-2 py-2 text-sm font-semibold text-danger hover:underline">Supprimer</summary>
                      <form action={deleteListing} className="absolute right-0 z-10 mt-1 flex w-60 flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-sm shadow-lg">
                        <input type="hidden" name="id" value={l.id} />
                        <p>Supprimer définitivement l’annonce et ses photos ?</p>
                        <button type="submit" className={btn.danger}>Oui, supprimer</button>
                      </form>
                    </details>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {favorites.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Mes favoris</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {favorites.map((l) => (
              <li key={l.id}>
                <Link href={listingPath(l)} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface hover:border-brand">
                  <span className="aspect-[4/3] bg-ground">
                    {l.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
                      <img src={l.photos[0].url} alt="" className="size-full object-cover" />
                    ) : null}
                  </span>
                  <span className="p-3">
                    <span className="line-clamp-2 font-semibold">{l.title}</span>
                    <span className="block font-bold text-brand-dark">{priceLabel(l.price_cents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setListingStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={btn.small}>{label}</button>
    </form>
  );
}
