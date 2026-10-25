import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatEuros } from '@/lib/format';
import { ANNUAL_DISCOUNT, COMPLET_PRICES, FREE_MACHINE_LIMIT, PLANS } from '@/lib/plans';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site';
import type { Payment, Subscription } from '@/lib/types';
import { Badge, Card, CheckIcon, Notice, btn } from '@/components/ui';
import { openBillingPortal, startCheckout } from './actions';

export const metadata: Metadata = { title: 'Abonnement' };

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Essai gratuit',
  active: 'Actif',
  past_due: 'Paiement en retard',
  canceled: 'Résilié',
  unpaid: 'Impayé',
  incomplete: 'Incomplet',
};

export default async function SubscriptionPage(props: PageProps<'/app/abonnement'>) {
  const { profile } = await requireUser('/app/abonnement');
  const { statut, raison } = await props.searchParams;
  const supabase = await createClient();
  const [{ data: subs }, { data: payments }] = await Promise.all([
    supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12),
  ]);
  const sub = (subs?.[0] ?? null) as Subscription | null;
  const plan = PLANS[profile.plan];

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Abonnement</h1>
      {statut === 'merci' ? (
        <Notice tone="green">Merci ! Votre abonnement est en cours d’activation : il apparaîtra ici dans quelques secondes.</Notice>
      ) : null}
      {raison === 'limite' ? <Notice>La formule gratuite est limitée à {FREE_MACHINE_LIMIT} machines : passez à la formule Complet pour un parc illimité.</Notice> : null}
      {raison === 'rapport' ? <Notice>Le rapport d’historique pour la revente est inclus dans la formule Complet.</Notice> : null}

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[1_1_420px]">
          <p className="text-sm text-muted">Votre formule</p>
          <h2 className="mb-2 flex items-center gap-3 text-2xl font-bold">
            {plan.name}
            {sub ? <Badge tone={sub.status === 'past_due' ? 'amber' : 'green'}>{STATUS_LABELS[sub.status] ?? sub.status}</Badge> : null}
          </h2>
          {sub?.current_period_end ? (
            <p className="mb-4 text-muted">
              {sub.cancel_at_period_end ? 'Se termine le ' : sub.status === 'trialing' ? 'Fin de l’essai le ' : 'Prochain paiement le '}
              {formatDate(sub.current_period_end, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          ) : null}
          <ul className="mb-6 flex flex-col gap-2">
            {plan.features.map((f) => <li key={f} className="flex gap-2"><CheckIcon className="mt-0.5 flex-none text-brand" />{f}</li>)}
          </ul>
          {profile.plan === 'free' ? (
            <form action={startCheckout} className="flex flex-col gap-3">
              <p className="font-semibold">Passer à la formule Complet : 30 jours offerts, puis</p>
              <div className="flex flex-wrap gap-3">
                <button type="submit" name="periode" value="mensuel" className={btn.secondary}>
                  {COMPLET_PRICES.mensuel.label} {COMPLET_PRICES.mensuel.period}
                </button>
                {env.stripePriceCompletAnnuel() ? (
                  <button type="submit" name="periode" value="annuel" className={btn.primary}>
                    {COMPLET_PRICES.annuel.label} {COMPLET_PRICES.annuel.period} · −{ANNUAL_DISCOUNT} %
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-muted">Prix TTC · {SITE.vatMention}</p>
            </form>
          ) : profile.stripe_customer_id ? (
            <form action={openBillingPortal}>
              <button type="submit" className={btn.secondary}>Gérer mon abonnement et mes factures</button>
            </form>
          ) : null}
          <p className="mt-4 text-sm text-muted">Paiement sécurisé par Stripe. Vos numéros de carte ne passent jamais par Tracteurs & Co.</p>
        </Card>

        <Card className="min-w-0 flex-[1_1_360px]">
          <h2 className="mb-3 text-xl font-semibold">Mes paiements</h2>
          {(payments ?? []).length === 0 ? (
            <p className="text-muted">Aucun paiement pour le moment.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {(payments as Payment[]).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <span>{formatDate(p.created_at)}</span>
                  <span className="flex items-center gap-3">
                    {formatEuros(p.amount_cents, p.currency)}
                    {p.status === 'paid' ? <Badge tone="green">Payé</Badge> : p.status === 'refunded' ? <Badge>Remboursé</Badge> : <Badge tone="amber">Échec</Badge>}
                    {p.hosted_invoice_url ? <a href={p.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">Facture</a> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
