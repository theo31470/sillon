import 'server-only';
import type Stripe from 'stripe';
import { stripe, ACTIVE_STATUSES } from '@/lib/stripe';
import { env } from '@/lib/env';
import type { BillingPeriod } from '@/lib/plans';

/** Ce que l'écran « Abonnement » montre de l'abonnement en cours (lu en direct chez Stripe). */
export type SubscriptionView = {
  id: string;
  status: Stripe.Subscription.Status;
  period: BillingPeriod;
  amountCents: number;
  /** Fin de la période en cours (prochaine échéance, ou fin de l'essai). */
  periodEnd: string | null;
  trialEnd: string | null;
  /** Date de fin si la résiliation est programmée. */
  cancelAt: string | null;
  /** Changement de formule prévu à la prochaine échéance. */
  pendingPeriod: BillingPeriod | null;
  pendingAt: string | null;
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  /** Facture impayée (paiement refusé) à régler. */
  openInvoice: { id: string; amountCents: number } | null;
  discount: string | null;
};

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

export function periodOfPrice(priceId: string | null | undefined): BillingPeriod {
  return priceId && priceId === env.stripePriceCompletAnnuel() ? 'annuel' : 'mensuel';
}

export function priceOfPeriod(period: BillingPeriod) {
  return period === 'annuel' && env.stripePriceCompletAnnuel() ? env.stripePriceCompletAnnuel()! : env.stripePriceComplet();
}

function cardOf(pm: string | Stripe.PaymentMethod | null | undefined) {
  if (!pm || typeof pm === 'string' || !pm.card) return null;
  return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
}

/** Abonnement Stripe en cours du client (essai, actif ou paiement en retard), le plus récent. */
export async function currentStripeSubscription(customerId: string) {
  const list = await stripe().subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  return list.data.filter((s) => ACTIVE_STATUSES.has(s.status)).sort((a, b) => b.created - a.created)[0] ?? null;
}

export async function loadSubscriptionView(customerId: string): Promise<SubscriptionView | null> {
  const found = await currentStripeSubscription(customerId);
  if (!found) return null;
  const sub = await stripe().subscriptions.retrieve(found.id, { expand: ['default_payment_method', 'schedule', 'discounts'] });
  const item = sub.items.data[0];

  let card = cardOf(sub.default_payment_method);
  if (!card) {
    const customer = await stripe().customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] });
    if (!('deleted' in customer && customer.deleted)) card = cardOf((customer as Stripe.Customer).invoice_settings?.default_payment_method);
  }

  let pendingPeriod: BillingPeriod | null = null;
  let pendingAt: string | null = null;
  const schedule = sub.schedule && typeof sub.schedule !== 'string' ? sub.schedule : null;
  if (schedule && schedule.status === 'active') {
    const next = schedule.phases.find((p) => p.start_date > Math.floor(Date.now() / 1000));
    const nextPrice = next?.items[0]?.price;
    const nextPriceId = typeof nextPrice === 'string' ? nextPrice : nextPrice?.id;
    if (next && nextPriceId && nextPriceId !== item?.price.id) {
      pendingPeriod = periodOfPrice(nextPriceId);
      pendingAt = iso(next.start_date);
    }
  }

  let openInvoice: SubscriptionView['openInvoice'] = null;
  if (sub.status === 'past_due') {
    const open = await stripe().invoices.list({ subscription: sub.id, status: 'open', limit: 1 });
    if (open.data[0]?.id) openInvoice = { id: open.data[0].id, amountCents: open.data[0].amount_remaining };
  }

  const discount = (sub.discounts ?? []).map((d) => (typeof d === 'string' ? null : d.promotion_code && typeof d.promotion_code !== 'string' ? d.promotion_code.code : d.source?.coupon && typeof d.source.coupon !== 'string' ? d.source.coupon.name : null)).find(Boolean) ?? null;

  return {
    id: sub.id,
    status: sub.status,
    period: periodOfPrice(item?.price.id),
    amountCents: item?.price.unit_amount ?? 0,
    periodEnd: iso(item?.current_period_end),
    trialEnd: sub.status === 'trialing' ? iso(sub.trial_end) : null,
    cancelAt: sub.cancel_at ? iso(sub.cancel_at) : sub.cancel_at_period_end ? iso(item?.current_period_end) : null,
    pendingPeriod,
    pendingAt,
    card,
    openInvoice,
    discount,
  };
}
