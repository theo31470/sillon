import 'server-only';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { billingEmail, type BillingEmailInput, type BillingTemplate } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';

/**
 * E-mails d'abonnement envoyés par le site (Stripe n'envoie rien en mode
 * test, et ses propres reçus restent génériques). Déclenchés par le webhook ;
 * la clé d'idempotence (identifiant de l'événement Stripe) évite tout doublon
 * si Stripe renvoie le même événement.
 */

export const frDate = (unixSeconds: number | null | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : undefined;

export const euros = (cents: number, currency = 'eur') =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: currency.toUpperCase() });

/** « 6,99 € par mois » d'après le prix de l'abonnement. */
export function priceLabelOf(sub: Stripe.Subscription) {
  const price = sub.items.data[0]?.price;
  if (!price?.unit_amount) return undefined;
  const per = price.recurring?.interval === 'year' ? 'par an' : 'par mois';
  return `${euros(price.unit_amount, price.currency)} ${per}`;
}

export async function notifyBilling(
  template: BillingTemplate,
  who: { userId?: string | null; customerId?: string | null },
  input: Omit<BillingEmailInput, 'name'>,
  eventId: string,
) {
  try {
    const db = createServiceClient();
    let q = db.from('profiles').select('id, email, full_name');
    if (who.userId) q = q.eq('id', who.userId);
    else if (who.customerId) q = q.eq('stripe_customer_id', who.customerId);
    else return;
    const { data: profile } = await q.maybeSingle();
    if (!profile?.email) return;
    await sendEmail(
      {
        to: profile.email,
        email: billingEmail(template, { ...input, name: profile.full_name }, env.siteUrl()),
        kind: 'facturation',
        template,
        userId: profile.id,
      },
      { idempotencyKey: `stripe-${eventId}-${template}` },
    );
  } catch (err) {
    // Un e-mail raté ne doit jamais faire échouer le webhook (Stripe réessaierait tout).
    console.error('[stripe] e-mail', template, err);
  }
}
