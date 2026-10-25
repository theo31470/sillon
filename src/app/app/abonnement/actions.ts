'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import { TRIAL_DAYS } from '@/lib/plans';
import { SITE } from '@/lib/site';

/** Mentions obligatoires d'une micro-entreprise, imprimées en bas de chaque facture Stripe. */
const INVOICE_FOOTER = `${SITE.name} – ${SITE.editor.name}, EI – SIRET ${SITE.editor.siret} – ${SITE.editor.address} – ${SITE.vatMention}.`;

/** Crée (une seule fois) le client Stripe associé au compte. */
async function ensureCustomer(userId: string, email: string, name: string, existing: string | null) {
  if (existing) return existing;
  const customer = await stripe().customers.create({
    email,
    name: name || undefined,
    metadata: { user_id: userId },
    preferred_locales: ['fr'],
    invoice_settings: { footer: INVOICE_FOOTER },
  });
  // Écriture serveur : un membre ne peut pas modifier ce champ lui-même (droits SQL).
  await createServiceClient().from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId);
  return customer.id;
}

export async function startCheckout(formData: FormData) {
  const { session, profile } = await requireUser('/app/abonnement');
  if (profile.plan !== 'free') redirect('/app/abonnement');

  const annual = formData.get('periode') === 'annuel' && env.stripePriceCompletAnnuel();
  const price = annual ? env.stripePriceCompletAnnuel()! : env.stripePriceComplet();

  const customer = await ensureCustomer(session.userId, profile.email, profile.full_name, profile.stripe_customer_id);
  const { count } = await createServiceClient()
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.userId);

  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: session.userId,
    line_items: [{ price, quantity: 1 }],
    // Essai gratuit uniquement pour un premier abonnement.
    subscription_data: { ...(count ? {} : { trial_period_days: TRIAL_DAYS }), metadata: { user_id: session.userId, plan: 'complet', periode: annual ? 'annuel' : 'mensuel' } },
    allow_promotion_codes: true,
    // Adresse de facturation sur les factures (clients professionnels).
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    locale: 'fr',
    success_url: `${env.siteUrl()}/app/abonnement?statut=merci`,
    cancel_url: `${env.siteUrl()}/app/abonnement`,
  });
  if (!checkout.url) throw new Error('Session de paiement indisponible');
  redirect(checkout.url);
}

export async function openBillingPortal() {
  const { profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) redirect('/app/abonnement');
  const portal = await stripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${env.siteUrl()}/app/abonnement`,
    locale: 'fr',
  });
  redirect(portal.url);
}
