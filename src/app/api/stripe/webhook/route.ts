import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { syncPlan } from '@/lib/membership';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import type { Plan } from '@/lib/types';
import { euros, frDate, notifyBilling, priceLabelOf } from '@/lib/email/billing';

/**
 * Webhook Stripe : seule source de vérité pour les abonnements et paiements.
 * Chaque appel est authentifié par la signature Stripe (STRIPE_WEBHOOK_SECRET).
 * Les écritures sont idempotentes (upsert) : Stripe peut renvoyer un même événement.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Signature manquante' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = await stripe().webhooks.constructEventAsync(payload, signature, env.stripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;
      case 'invoice.paid':
        await recordInvoice(event.data.object, 'paid');
        break;
      case 'invoice.payment_failed':
        await recordInvoice(event.data.object, 'failed');
        break;
      default:
        break;
    }
    await sendBillingEmails(event);
  } catch (error) {
    console.error('[stripe] erreur de traitement', event.type, error);
    // 500 : Stripe réessaiera plus tard.
    return NextResponse.json({ error: 'Erreur de traitement' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) => (typeof c === 'string' ? c : c?.id ?? null);

async function userIdForCustomer(customer: string | null) {
  if (!customer) return null;
  const { data } = await createServiceClient().from('profiles').select('id').eq('stripe_customer_id', customer).maybeSingle();
  return data?.id ?? null;
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customer = customerId(session.customer);
  const userId = session.client_reference_id;
  if (!customer || !userId) return;
  // Rattache le client Stripe au compte s'il ne l'est pas encore.
  await createServiceClient().from('profiles').update({ stripe_customer_id: customer }).eq('id', userId).is('stripe_customer_id', null);
}

async function syncSubscription(sub: Stripe.Subscription) {
  const supabase = createServiceClient();
  const userId = (await userIdForCustomer(customerId(sub.customer))) ?? sub.metadata?.user_id ?? null;
  if (!userId) {
    console.warn('[stripe] abonnement sans compte associé', sub.id);
    return;
  }
  const item = sub.items.data[0];
  const plan: Plan = sub.metadata?.plan === 'groupement' ? 'groupement' : 'complet';

  await supabase.from('subscriptions').upsert({
    id: sub.id,
    user_id: userId,
    status: sub.status,
    plan,
    price_id: item?.price.id ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    // Le portail Stripe programme désormais la résiliation avec « cancel_at » (date) plutôt qu'avec ce booléen.
    cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
  });

  // La formule du profil suit le meilleur abonnement actif (ou une formule offerte).
  await syncPlan(userId);
}

async function recordInvoice(invoice: Stripe.Invoice, status: 'paid' | 'failed') {
  if (!invoice.id) return;
  const userId = await userIdForCustomer(customerId(invoice.customer));
  await createServiceClient().from('payments').upsert({
    id: invoice.id,
    user_id: userId,
    amount_cents: status === 'paid' ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    status,
    failure_reason: status === 'failed' ? 'Paiement refusé' : null,
    attempt_count: invoice.attempt_count,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    created_at: new Date(invoice.created * 1000).toISOString(),
  });
}

/** E-mails à l'abonné, après l'enregistrement en base. */
async function sendBillingEmails(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created': {
      const sub = event.data.object;
      const trial = sub.status === 'trialing';
      await notifyBilling(
        'abonnement_active',
        { customerId: customerId(sub.customer), userId: sub.metadata?.user_id },
        { trial, date: frDate(trial ? sub.trial_end : sub.items.data[0]?.current_period_end), priceLabel: priceLabelOf(sub) },
        event.id,
      );
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const before = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
      const nowCancelling = sub.cancel_at_period_end || Boolean(sub.cancel_at);
      const wasCancelling = before.cancel_at_period_end === true || Boolean(before.cancel_at);
      const changed = 'cancel_at_period_end' in before || 'cancel_at' in before;
      if (changed && nowCancelling && !wasCancelling) {
        await notifyBilling(
          'resiliation_programmee',
          { customerId: customerId(sub.customer) },
          { date: frDate(sub.cancel_at ?? sub.items.data[0]?.current_period_end) },
          event.id,
        );
      }
      break;
    }
    case 'customer.subscription.deleted':
      await notifyBilling('abonnement_termine', { customerId: customerId(event.data.object.customer) }, {}, event.id);
      break;
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object;
      // Pas de rappel si l'abonné a déjà résilié.
      if (!sub.cancel_at_period_end && !sub.cancel_at) {
        await notifyBilling('essai_fin_proche', { customerId: customerId(sub.customer) }, { date: frDate(sub.trial_end), priceLabel: priceLabelOf(sub) }, event.id);
      }
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      // La facture à 0 € du début d'essai n'a pas besoin d'e-mail (l'activation en a déjà un).
      if (invoice.amount_paid > 0) {
        await notifyBilling(
          'paiement_recu',
          { customerId: customerId(invoice.customer) },
          { amount: euros(invoice.amount_paid, invoice.currency), invoiceUrl: invoice.hosted_invoice_url ?? null, date: frDate(invoice.lines.data[0]?.period?.end) },
          event.id,
        );
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await notifyBilling('paiement_refuse', { customerId: customerId(invoice.customer) }, { amount: euros(invoice.amount_due, invoice.currency) }, event.id);
      break;
    }
    default:
      break;
  }
}
