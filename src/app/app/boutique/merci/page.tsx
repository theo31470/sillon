import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { settleShopPayment, type ShopOrderRow } from '@/lib/shop';
import { btn, Card } from '@/components/ui';
import { OrderCard } from '../order-card';
import { ClearCart } from './clear-cart';

export const metadata: Metadata = { title: 'Merci · Boutique' };

export default async function ThanksPage(props: PageProps<'/app/boutique/merci'>) {
  await requireUser('/app/boutique/commandes');
  const { commande, redirect_status } = await props.searchParams;
  const id = typeof commande === 'string' && /^[0-9a-f-]{36}$/i.test(commande) ? commande : null;
  const load = async () => {
    const { data } = id ? await (await createClient()).from('shop_orders').select('*').eq('id', id).maybeSingle() : { data: null };
    return data as ShopOrderRow | null;
  };
  let order = await load();
  // Retour de la validation bancaire (3-D Secure) : le paiement est relu chez Stripe et la commande part.
  if (order?.status === 'pending' && order.stripe_payment_intent && redirect_status !== 'failed') {
    await settleShopPayment(order.stripe_payment_intent).catch((err) => console.error('[boutique] retour de paiement', err));
    order = await load();
  }

  if (redirect_status === 'failed' || (order && order.status === 'pending' && redirect_status)) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Le paiement n’a pas abouti</h1>
        <p className="text-muted">La validation par votre banque a échoué ou a été annulée. Rien n’a été débité : votre panier est intact, vous pouvez réessayer.</p>
        <Link href="/app/boutique/panier" className={btn.primary}>Retour au panier</Link>
      </Card>
    );
  }

  return (
    <>
      <ClearCart />
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Merci pour votre commande !</h1>
        <p className="text-muted">
          {order && order.status !== 'pending'
            ? 'Le paiement est bien reçu. Un e-mail de confirmation vient de partir, et vous recevrez le numéro de suivi dès l’expédition.'
            : 'Votre paiement est en cours de validation : la commande apparaîtra dans « Mes commandes » d’ici quelques instants, et un e-mail de confirmation vous sera envoyé.'}
        </p>
      </div>
      {order && order.status !== 'pending' ? <OrderCard order={order} /> : null}
      <Card className="flex flex-wrap gap-3">
        <Link href="/app/boutique/commandes" className={btn.primary}>Mes commandes</Link>
        <Link href="/app/boutique" className={btn.secondary}>Retour à la boutique</Link>
      </Card>
    </>
  );
}
