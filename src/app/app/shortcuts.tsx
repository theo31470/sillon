import Link from 'next/link';
import type { Route } from 'next';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { shopIsOpen } from '@/lib/printful';
import { Icon, type IconName } from '@/components/sheets/icons';

/** Les autres univers de Tracteurs & Co, depuis le tableau de bord, avec ce qui attend le membre. */
export async function Shortcuts() {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const [{ data: convs }, { count: toHandle }, { count: online }, shop] = await Promise.all([
    supabase.from('listing_conversations').select('buyer_id, last_message_at, buyer_read_at, seller_read_at').or(`buyer_id.eq.${session.userId},seller_id.eq.${session.userId}`),
    supabase.from('listing_orders').select('id', { count: 'exact', head: true }).eq('seller_id', session.userId).eq('status', 'paid'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', session.userId).eq('status', 'en_ligne'),
    shopIsOpen().catch(() => false),
  ]);
  const unread = (convs ?? []).filter((c) => {
    const readAt = c.buyer_id === session.userId ? c.buyer_read_at : c.seller_read_at;
    return !readAt || readAt < c.last_message_at;
  }).length;
  const bourse = [toHandle ? `${toHandle} vente${toHandle > 1 ? 's' : ''} à traiter` : '', unread ? `${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}` : '', online ? `${online} annonce${online > 1 ? 's' : ''} en ligne` : '']
    .filter(Boolean)
    .join(' · ');

  const tiles: { href: Route; icon: IconName; title: string; text: string; alert?: boolean }[] = [
    { href: '/app/annonces', icon: 'tag', title: 'Bourse au matériel', text: bourse || 'Vendez ou achetez du matériel d’occasion', alert: Boolean(toHandle || unread) },
    { href: '/fiches', icon: 'book', title: 'Fiches techniques', text: 'Caractéristiques, entretien et pannes de chaque modèle' },
    ...(shop ? [{ href: '/app/boutique' as Route, icon: 'spark' as IconName, title: 'Boutique', text: 'Vêtements et goodies Tracteurs & Co' }] : []),
  ];

  return (
    <section aria-labelledby="raccourcis">
      <h2 id="raccourcis" className="mb-4 text-xl font-semibold">Aussi sur Tracteurs & Co</h2>
      <div className="grid gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand">
            <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
              <Icon name={t.icon} size={22} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{t.title}</span>
              <span className={`block text-sm ${t.alert ? 'font-semibold text-brand-dark' : 'text-muted'}`}>{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
