import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { daysAgoIso, formatDate, formatEuros } from '@/lib/format';
import { getShopCatalog, printfulConfigured, webhookConfig } from '@/lib/printful';
import { orderReference, type ShopOrderRow } from '@/lib/shop';
import { SHOP_MEMBER_DISCOUNT, SHOP_STATUS_LABELS } from '@/lib/shop-shared';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/form-bits';
import { Badge, Card, Notice } from '@/components/ui';
import { connectWebhook, refreshCatalog, resubmitOrder, resyncOrder } from './actions';

export const metadata = { title: 'Boutique' };

const stripePayment = (pi: string) => `https://dashboard.stripe.com/${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'test/' : ''}payments/${pi}`;

export default async function AdminShopPage() {
  await requireAdmin('/admin/boutique');
  const configured = printfulConfigured();
  const hookUrl = `${env.siteUrl().replace(/\/$/, '')}/api/boutique/printful`;
  const [catalog, hook, ordersRes, profilesRes] = await Promise.all([
    getShopCatalog(),
    configured ? webhookConfig().catch(() => null) : Promise.resolve(null),
    (await createClient()).from('shop_orders').select('*').not('status', 'in', '(pending,abandoned)').order('created_at', { ascending: false }).limit(100),
    (await createClient()).from('profiles').select('id, farm_name, full_name, email'),
  ]);
  const orders = (ordersRes.data ?? []) as ShopOrderRow[];
  const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.farm_name || p.full_name || p.email]));
  const since = daysAgoIso(30);
  const paid = orders.filter((o) => !['refunded', 'canceled'].includes(o.status));
  const hookOk = hook?.url === hookUrl;
  const kpis = [
    { label: 'Ventes sur 30 jours', value: formatEuros(paid.filter((o) => (o.paid_at ?? o.created_at) >= since).reduce((t, o) => t + o.total_cents, 0)) },
    { label: 'Commandes sur 30 jours', value: paid.filter((o) => (o.paid_at ?? o.created_at) >= since).length },
    { label: 'En préparation', value: orders.filter((o) => o.status === 'submitted' || o.status === 'paid').length },
    { label: 'À vérifier', value: orders.filter((o) => o.status === 'failed').length },
  ];

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Boutique</h1>
        <p className="max-w-3xl text-muted">
          Vêtements et goodies imprimés et expédiés par Printful, réservés aux membres, livrés en France. Formule Complet : −{SHOP_MEMBER_DISCOUNT} %. Les produits et leurs prix se
          gèrent dans Printful ; le paiement passe par Stripe, puis la commande part chez Printful toute seule.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Branchement</h2>
        <ul className="flex flex-col gap-2 text-[15px]">
          <li className="flex flex-wrap items-center gap-2">
            {configured ? <Badge tone="green">OK</Badge> : <Badge tone="amber">À faire</Badge>}
            Clé Printful {configured ? 'ajoutée' : <>absente : ajoutez <code>PRINTFUL_API_KEY</code> dans Vercel (option « Sensitive »), puis redéployez</>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {catalog.products.length ? <Badge tone="green">OK</Badge> : <Badge tone="amber">À faire</Badge>}
            {catalog.error
              ? `Printful répond par une erreur : ${catalog.error}`
              : `${catalog.products.length} produit${catalog.products.length > 1 ? 's' : ''} en vente${catalog.products.length ? '' : ' : créez-en dans Printful (boutique de type « Manual order platform / API »)'}`}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {hookOk ? <Badge tone="green">OK</Badge> : <Badge tone="amber">À faire</Badge>}
            Notifications d’expédition {hookOk ? 'branchées' : 'pas encore branchées (les colis sont aussi relus une fois par jour)'}
          </li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <ActionForm action={refreshCatalog} resetOnSuccess={false} className="flex flex-col gap-2">
            <SubmitButton variant="secondary" pendingLabel="Chargement…">Recharger les produits</SubmitButton>
          </ActionForm>
          {configured && !hookOk ? (
            <ActionForm action={connectWebhook} resetOnSuccess={false} className="flex flex-col gap-2">
              <SubmitButton pendingLabel="Branchement…">Brancher les notifications</SubmitButton>
            </ActionForm>
          ) : null}
          <Link href="/app/boutique" className="btn inline-flex min-h-12 items-center rounded-[10px] px-2 font-semibold text-brand-dark hover:underline">Voir la boutique →</Link>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="flex flex-col gap-1">
            <span className="text-sm text-muted">{k.label}</span>
            <span className="text-2xl font-bold">{k.value}</span>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-xl font-semibold">Commandes</h2>
        {orders.length === 0 ? (
          <p className="rounded-xl bg-ground px-4 py-3 text-sm text-muted">Aucune commande pour le moment.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold">{orderReference(o.id)}</span>
                  <span className="text-sm text-muted">{formatDate(o.paid_at ?? o.created_at)}</span>
                  {o.user_id ? (
                    <Link href={`/admin/membres/${o.user_id}`} className="font-medium hover:text-brand">{names.get(o.user_id) ?? o.email}</Link>
                  ) : (
                    <span>{o.email}</span>
                  )}
                  <span className="font-semibold">{formatEuros(o.total_cents)}</span>
                  <Badge tone={o.status === 'shipped' ? 'green' : o.status === 'failed' ? 'amber' : 'gray'}>{SHOP_STATUS_LABELS[o.status]}</Badge>
                  {o.printful_status ? <span className="text-sm text-muted">Printful : {o.printful_status}</span> : null}
                </div>
                <p className="text-sm text-muted">
                  {o.items.map((i) => `${i.quantity} × ${i.name}${i.detail ? ` (${i.detail})` : ''}`).join(' · ')}
                  {o.recipient ? ` — ${o.recipient.zip} ${o.recipient.city}` : ''}
                </p>
                {o.error ? <Notice tone="red">{o.error}</Notice> : null}
                <div className="flex flex-wrap items-start gap-3 text-sm">
                  {o.status === 'failed' && !o.printful_order_id ? (
                    <ActionForm action={resubmitOrder} resetOnSuccess={false} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={o.id} />
                      <SubmitButton variant="small" pendingLabel="Envoi…">Renvoyer à Printful</SubmitButton>
                    </ActionForm>
                  ) : null}
                  {o.printful_order_id ? (
                    <ActionForm action={resyncOrder} resetOnSuccess={false} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={o.id} />
                      <SubmitButton variant="small" pendingLabel="Lecture…">Relire le suivi</SubmitButton>
                    </ActionForm>
                  ) : null}
                  {o.printful_order_id ? (
                    <a href={`https://www.printful.com/dashboard/default/orders?search=${o.printful_order_id}`} target="_blank" rel="noopener" className="py-2 font-semibold text-brand-dark hover:underline">
                      Ouvrir dans Printful
                    </a>
                  ) : null}
                  {o.stripe_payment_intent ? (
                    <a href={stripePayment(o.stripe_payment_intent)} target="_blank" rel="noopener" className="py-2 font-semibold text-brand-dark hover:underline">
                      Paiement Stripe (rembourser)
                    </a>
                  ) : null}
                  {o.tracking[0]?.url ? (
                    <a href={o.tracking[0].url} target="_blank" rel="noopener" className="py-2 font-semibold text-brand-dark hover:underline">
                      Suivi {o.tracking[0].carrier}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
