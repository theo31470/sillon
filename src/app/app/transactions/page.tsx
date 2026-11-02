import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ListingOrder } from '@/lib/bourse-pay';
import { ORDER_STATUS } from '@/lib/bourse-shared';
import { formatDate, formatEuros } from '@/lib/format';
import { Badge, Card, btn } from '@/components/ui';
import { BourseTabs } from '@/app/app/bourse-tabs';

export const metadata: Metadata = { title: 'Mes transactions · Bourse' };

const ACTIVE = ['paid', 'shipped', 'disputed'];

export default async function TransactionsPage() {
  const { session } = await requireUser('/app/transactions');
  const { data } = await (await createClient())
    .from('listing_orders')
    .select('*')
    .or(`buyer_id.eq.${session.userId},seller_id.eq.${session.userId}`)
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(100);
  const orders = ((data ?? []) as ListingOrder[]).filter((o) => o.status !== 'pending' || o.buyer_id === session.userId);
  const sales = orders.filter((o) => o.seller_id === session.userId && o.status !== 'pending');
  const purchases = orders.filter((o) => o.buyer_id === session.userId);
  const todo = sales.filter((o) => o.status === 'paid').length;

  return (
    <>
      <BourseTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mes transactions</h1>
          <p className="text-muted">Achats et ventes payés sur la bourse, avec le paiement sécurisé.</p>
        </div>
      </div>

      <Section title="Mes ventes" badge={todo ? `${todo} à traiter` : null} orders={sales} me="seller" empty="Aucune vente payée en ligne pour le moment." />
      <Section title="Mes achats" orders={purchases} me="buyer" empty="Aucun achat pour le moment.">
        <Link href="/bourse" className={btn.secondary}>Parcourir la bourse</Link>
      </Section>
    </>
  );
}

function Section({ title, badge, orders, me, empty, children }: { title: string; badge?: string | null; orders: ListingOrder[]; me: 'buyer' | 'seller'; empty: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        {title}
        {badge ? <Badge tone="amber">{badge}</Badge> : null}
      </h2>
      {orders.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-muted">{empty}</p>
          {children}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/app/transactions/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand">
                <span className="size-14 flex-none overflow-hidden rounded-xl bg-ground">
                  {o.snapshot.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo de l'annonce
                    <img src={o.snapshot.photo} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <Badge tone={o.status === 'completed' ? 'green' : o.status === 'disputed' ? 'red' : ACTIVE.includes(o.status) ? 'amber' : 'gray'}>{label(o, me)}</Badge>
                  <span className="mt-1 block truncate font-semibold">{o.snapshot.title}</span>
                  <span className="text-sm text-muted">
                    {formatEuros(me === 'seller' ? o.price_cents + o.shipping_cents : o.total_cents)} · {o.mode === 'envoi' ? 'envoi' : 'main propre'} · {formatDate(o.paid_at ?? o.created_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function label(o: ListingOrder, me: 'buyer' | 'seller') {
  if (o.status === 'paid') {
    if (me === 'seller') return o.mode === 'envoi' ? 'À expédier' : 'À remettre';
    return o.mode === 'envoi' ? 'En attente d’envoi' : 'À récupérer';
  }
  return ORDER_STATUS[o.status];
}
