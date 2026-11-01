import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { upsertSubscription } from '@/lib/stripe-sync';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import { euros, frDate, notifyBilling, priceLabelOf } from '@/lib/email/billing';
import { isFullyDiscounted, issueInvoiceForStripeInvoice } from '@/lib/invoices/issue';
import { rewardReferrer } from '@/lib/referrals';
import { invoiceAttachment, onChargeRefunded } from '@/lib/invoices/notify';
import { onShopCheckoutCompleted, onShopCheckoutExpired, onShopRefund } from '@/lib/shop';

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
        // Boutique : paiement d'une commande (transmise ensuite à Printful).
        if (event.data.object.metadata?.kind === 'boutique') await onShopCheckoutCompleted(event.data.object);
        else await onCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.async_payment_succeeded':
        // Moyen de paiement différé (virement, prélèvement) : la commande part une fois l'argent reçu.
        if (event.data.object.metadata?.kind === 'boutique') await onShopCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        if (event.data.object.metadata?.kind === 'boutique') await onShopCheckoutExpired(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;
      case 'invoice.paid':
        await recordInvoice(event.data.object, 'paid');
        // Facture Tracteurs & Co (numérotée, figée) : en cas d'échec, Stripe réessaiera.
        await issueInvoiceForStripeInvoice(event.data.object);
        // Premier vrai paiement d'un filleul : un mois de crédit pour son parrain.
        if (event.data.object.amount_paid > 0) await rewardReferrer(await userIdForCustomer(customerId(event.data.object.customer)));
        break;
      case 'charge.refunded':
        await onChargeRefunded(event.data.object, event.id);
        await onShopRefund(event.data.object);
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
  await upsertSubscription(sub);
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
      // La facture à 0 € du début d'essai n'a pas besoin d'e-mail (l'activation en a déjà un) ;
      // une échéance offerte par un code à 100 % donne une vraie facture, envoyée comme les autres.
      const offered = isFullyDiscounted(invoice);
      if (invoice.amount_paid > 0 || offered) {
        const ours = await issueInvoiceForStripeInvoice(invoice);
        const file = ours ? await invoiceAttachment(ours).catch(() => null) : null;
        await notifyBilling(
          'paiement_recu',
          { customerId: customerId(invoice.customer) },
          {
            amount: euros(invoice.amount_paid, invoice.currency),
            invoiceUrl: file?.url ?? null,
            invoiceNumber: ours?.number,
            offered,
            date: frDate(invoice.lines.data[0]?.period?.end),
          },
          event.id,
          file?.attachments,
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
