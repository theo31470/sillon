import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { BourseTabsNav } from './bourse-tabs-nav';

/** Sous-navigation commune de la bourse (annonces, messages, transactions, versements) avec les compteurs. */
export async function BourseTabs() {
  const session = await getSession();
  let unread = 0;
  let toHandle = 0;
  if (session) {
    const supabase = await createClient();
    const [{ data: convs }, { count }] = await Promise.all([
      supabase.from('listing_conversations').select('buyer_id, last_message_at, buyer_read_at, seller_read_at').or(`buyer_id.eq.${session.userId},seller_id.eq.${session.userId}`),
      supabase.from('listing_orders').select('id', { count: 'exact', head: true }).eq('seller_id', session.userId).eq('status', 'paid'),
    ]);
    unread = (convs ?? []).filter((c) => {
      const readAt = c.buyer_id === session.userId ? c.buyer_read_at : c.seller_read_at;
      return !readAt || readAt < c.last_message_at;
    }).length;
    toHandle = count ?? 0;
  }
  return (
    <BourseTabsNav
      tabs={[
        { href: '/app/annonces', label: 'Mes annonces' },
        { href: '/app/messages', label: 'Messages', badge: unread },
        { href: '/app/transactions', label: 'Transactions', badge: toHandle },
        { href: '/app/annonces/versements', label: 'Versements' },
      ]}
    />
  );
}
