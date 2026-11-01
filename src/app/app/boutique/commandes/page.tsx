import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ShopOrderRow } from '@/lib/shop';
import { SITE } from '@/lib/site';
import { btn, Card } from '@/components/ui';
import { OrderCard } from '../order-card';

export const metadata: Metadata = { title: 'Mes commandes · Boutique' };

export default async function OrdersPage() {
  const { session } = await requireUser('/app/boutique/commandes');
  const { data } = await (await createClient())
    .from('shop_orders')
    .select('*')
    .eq('user_id', session.userId)
    .not('status', 'in', '(pending,abandoned)')
    .order('created_at', { ascending: false })
    .limit(50);
  const orders = (data ?? []) as ShopOrderRow[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Mes commandes</h1>
        <Link href="/app/boutique" className="font-semibold text-brand-dark hover:underline">← Boutique</Link>
      </div>
      {orders.length ? (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
      ) : (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-lg font-semibold">Aucune commande pour le moment.</p>
          <Link href="/app/boutique" className={btn.primary}>Voir la boutique</Link>
        </Card>
      )}
      <p className="text-sm text-muted">
        Un souci avec un article (défaut d’impression, colis abîmé) ? Écrivez-nous à{' '}
        <a href={`mailto:${SITE.contactEmail}`} className="font-semibold underline underline-offset-4">{SITE.contactEmail}</a> avec une photo et la référence de la commande.
      </p>
    </>
  );
}
