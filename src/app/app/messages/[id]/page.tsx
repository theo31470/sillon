import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { markConversationRead, publicName, type Conversation, type Listing } from '@/lib/bourse';
import { LISTING_STATUS, listingPath, priceLabel } from '@/lib/bourse-shared';
import { formatDate } from '@/lib/format';
import { Badge, Notice } from '@/components/ui';
import { ReplyBox, AutoRefresh } from './reply-box';

export const metadata: Metadata = { title: 'Conversation · Bourse' };

const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

export default async function ConversationPage(props: PageProps<'/app/messages/[id]'>) {
  const { id } = await props.params;
  const { session } = await requireUser(`/app/messages/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from('listing_conversations').select('*').eq('id', id).maybeSingle();
  const conv = c as Conversation | null;
  if (!conv || (conv.buyer_id !== session.userId && conv.seller_id !== session.userId)) notFound();
  const db = createServiceClient();
  const iAmSeller = conv.seller_id === session.userId;
  const otherId = iAmSeller ? conv.buyer_id : conv.seller_id;
  const [{ data: msgs }, { data: l }, { data: other }] = await Promise.all([
    supabase.from('listing_messages').select('id, sender_id, body, created_at').eq('conversation_id', id).order('created_at').limit(500),
    db.from('listings').select('id, ref, title, price_cents, photos, status, seller_id').eq('id', conv.listing_id).maybeSingle(),
    db.from('profiles').select('full_name, created_at').eq('id', otherId).maybeSingle(),
  ]);
  await markConversationRead(conv, session.userId);
  const listing = l as Pick<Listing, 'id' | 'ref' | 'title' | 'price_cents' | 'photos' | 'status'> | null;
  const messages = (msgs ?? []) as { id: string; sender_id: string; body: string; created_at: string }[];
  const otherName = publicName(other?.full_name as string | undefined);
  const dayOf = (iso: string) => formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: undefined });
  const days = messages.map((m) => dayOf(m.created_at));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <AutoRefresh />
      <Link href="/app/messages" className="self-start font-semibold text-brand-dark hover:underline">← Messages</Link>
      {listing ? (
        <Link href={listingPath(listing)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand">
          <span className="size-14 flex-none overflow-hidden rounded-xl bg-ground">
            {listing.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
              <img src={listing.photos[0].url} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{listing.title}</span>
            <span className="text-sm font-bold text-brand-dark">{priceLabel(listing.price_cents)}</span>
          </span>
          {listing.status !== 'en_ligne' ? <Badge tone="amber">{LISTING_STATUS[listing.status]}</Badge> : null}
        </Link>
      ) : (
        <Notice tone="gray">Cette annonce a été supprimée.</Notice>
      )}

      <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3 sm:p-5">
        <p className="mb-2 text-center text-sm text-muted">
          Conversation avec <strong className="text-ink">{otherName}</strong>
          {other?.created_at ? `, membre depuis ${formatDate(other.created_at as string, { month: 'long', year: 'numeric', day: undefined })}` : ''}
        </p>
        {messages.map((m, i) => {
          const mine = m.sender_id === session.userId;
          const day = days[i];
          const showDay = i === 0 || day !== days[i - 1];
          return (
            <div key={m.id} className="flex flex-col">
              {showDay ? <p className="my-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">{day}</p> : null}
              <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${mine ? 'self-end rounded-br-md bg-brand text-on-brand' : 'self-start rounded-bl-md bg-ground'}`}>
                {m.body}
                <span className={`mt-1 block text-right text-[11px] ${mine ? 'text-on-brand/75' : 'text-muted'}`}>{time(m.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {listing && ['en_ligne', 'reservee'].includes(listing.status) ? (
        <ReplyBox conversationId={conv.id} />
      ) : (
        <Notice tone="gray">{listing ? `Annonce ${LISTING_STATUS[listing.status].toLowerCase()} : la conversation est close.` : 'La conversation est close.'}</Notice>
      )}
      <p className="text-center text-xs text-muted">
        Pour votre sécurité, ne communiquez jamais vos coordonnées bancaires et méfiez-vous des paiements par mandat, coupon ou virement à l’étranger.
      </p>
    </div>
  );
}
