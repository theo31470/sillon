import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { publicName, type Conversation, type Listing } from '@/lib/bourse';
import { priceLabel } from '@/lib/bourse-shared';
import { formatDate } from '@/lib/format';
import { Card, btn } from '@/components/ui';

export const metadata: Metadata = { title: 'Messages · Bourse' };

export default async function MessagesPage() {
  const { session } = await requireUser('/app/messages');
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('listing_conversations')
    .select('*')
    .or(`buyer_id.eq.${session.userId},seller_id.eq.${session.userId}`)
    .order('last_message_at', { ascending: false })
    .limit(100);
  const convs = (rows ?? []) as Conversation[];
  const db = createServiceClient();
  const listingIds = [...new Set(convs.map((c) => c.listing_id))];
  const otherIds = [...new Set(convs.map((c) => (c.buyer_id === session.userId ? c.seller_id : c.buyer_id)))];
  const [{ data: listings }, { data: people }, { data: lasts }] = await Promise.all([
    listingIds.length ? db.from('listings').select('id, ref, title, price_cents, photos, status').in('id', listingIds) : Promise.resolve({ data: [] }),
    otherIds.length ? db.from('profiles').select('id, full_name').in('id', otherIds) : Promise.resolve({ data: [] }),
    convs.length
      ? db.from('listing_messages').select('conversation_id, body, sender_id, created_at').in('conversation_id', convs.map((c) => c.id)).order('created_at', { ascending: false }).limit(400)
      : Promise.resolve({ data: [] }),
  ]);
  const listingOf = (id: string) => (listings ?? []).find((l) => l.id === id) as Pick<Listing, 'id' | 'ref' | 'title' | 'price_cents' | 'photos' | 'status'> | undefined;
  const nameOf = (id: string) => publicName((people ?? []).find((p) => p.id === id)?.full_name as string | undefined);
  const lastOf = (id: string) => (lasts ?? []).find((m) => m.conversation_id === id);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted">Vos échanges avec les acheteurs et les vendeurs de la bourse.</p>
        </div>
        <Link href="/app/annonces" className="font-semibold text-brand-dark hover:underline">← Mes annonces</Link>
      </div>
      {convs.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-lg font-semibold">Aucune conversation pour le moment.</p>
          <p className="text-muted">Quand vous contactez un vendeur, ou qu’un acheteur vous écrit, l’échange apparaît ici.</p>
          <Link href="/bourse" className={btn.primary}>Parcourir la bourse</Link>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
          {convs.map((c) => {
            const l = listingOf(c.listing_id);
            const other = c.buyer_id === session.userId ? c.seller_id : c.buyer_id;
            const read = c.buyer_id === session.userId ? c.buyer_read_at : c.seller_read_at;
            const unread = !read || read < c.last_message_at;
            const last = lastOf(c.id);
            return (
              <li key={c.id}>
                <Link href={`/app/messages/${c.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-ground sm:p-4">
                  <span className="size-14 flex-none overflow-hidden rounded-xl bg-ground">
                    {l?.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
                      <img src={l.photos[0].url} alt="" className="size-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{nameOf(other)}</span>
                      <span className="flex-none text-xs text-muted">{formatDate(c.last_message_at, { day: 'numeric', month: 'short', year: undefined })}</span>
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {c.seller_id === session.userId ? 'Votre annonce' : 'Annonce'} · {l ? `${l.title} · ${priceLabel(l.price_cents)}` : 'supprimée'}
                    </span>
                    <span className={`block truncate text-sm ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                      {last ? `${last.sender_id === session.userId ? 'Vous : ' : ''}${last.body}` : ''}
                    </span>
                  </span>
                  {unread ? <span className="size-2.5 flex-none rounded-full bg-brand" aria-label="Non lu" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
