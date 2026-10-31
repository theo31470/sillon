'use server';

import { revalidatePath } from 'next/cache';
import type Stripe from 'stripe';
import { requireUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { COMPLET_PRICES, TRIAL_DAYS, type BillingPeriod } from '@/lib/plans';
import { SITE } from '@/lib/site';
import { rateLimit } from '@/lib/rate-limit';
import { billingFromForm, saveBillingDetails } from '@/lib/billing-details';
import { upsertSubscription } from '@/lib/stripe-sync';
import { currentStripeSubscription, priceOfPeriod } from '@/lib/subscription-view';
import { applyPeriodChange } from '@/lib/subscription-ops';
import type { FormState } from '@/components/form-bits';

/**
 * Abonnement géré entièrement sur le site. Les données de carte ne passent
 * jamais par nos serveurs : le formulaire Stripe (Payment Element) les envoie
 * directement à Stripe, qui nous renvoie un identifiant de moyen de paiement.
 * Chaque action vérifie la session et n'agit que sur le client Stripe du membre.
 */

type Profile = Awaited<ReturnType<typeof requireUser>>['profile'];

const STRIPE_ERROR = 'Le service de paiement ne répond pas. Réessayez dans un instant.';

function stripeMessage(err: unknown) {
  const e = err as { type?: string; message?: string; code?: string };
  if (e?.type === 'StripeCardError') return e.message ?? 'Carte refusée.';
  console.error('[abonnement]', e?.code ?? '', e?.message ?? err);
  return STRIPE_ERROR;
}

function limited(userId: string) {
  return !rateLimit(`abonnement:${userId}`, 12, 60_000).ok;
}

const periodOf = (v: FormDataEntryValue | null): BillingPeriod => (v === 'annuel' ? 'annuel' : 'mensuel');

/** Client Stripe du membre, créé à la première utilisation. */
async function ensureCustomer(profile: Profile, userId: string) {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripe().customers.create(
    { email: profile.email, name: profile.farm_name || profile.full_name || undefined, metadata: { user_id: userId }, preferred_locales: ['fr'] },
    { idempotencyKey: `client-${userId}` },
  );
  // Écriture serveur : un membre ne peut pas modifier ce champ lui-même (droits SQL).
  await createServiceClient().from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId).is('stripe_customer_id', null);
  const { data } = await createServiceClient().from('profiles').select('stripe_customer_id').eq('id', userId).single();
  return (data?.stripe_customer_id as string) ?? customer.id;
}

type PromoLookup = { id: null } | { id: string; code: string; coupon: Stripe.Coupon } | { error: string };

/** Code promotionnel actif et sa remise (le coupon Stripe). */
async function lookupPromo(code: string): Promise<PromoLookup> {
  const clean = code.trim();
  if (!clean) return { id: null };
  const list = await stripe().promotionCodes.list({ code: clean, active: true, limit: 1, expand: ['data.promotion.coupon'] });
  const promo = list.data[0];
  const coupon = promo?.promotion?.coupon;
  if (!promo || !coupon) return { error: 'Code promotionnel inconnu ou expiré.' };
  const c = typeof coupon === 'string' ? await stripe().coupons.retrieve(coupon) : coupon;
  if (!c.valid) return { error: 'Ce code promotionnel n’est plus valable.' };
  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) return { error: 'Ce code promotionnel a expiré.' };
  if (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions) return { error: 'Ce code promotionnel a déjà été utilisé.' };
  return { id: promo.id, code: promo.code, coupon: c };
}

const euroLabel = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

export type PromoPreview = {
  code: string;
  /** « −20 % sur le 1er paiement », « −100 % sur tous les paiements »… */
  summary: string;
  /** Montant du premier paiement (ou du premier après l'essai), en centimes. */
  firstCents: number;
  firstLabel: string;
  /** Gratuit pour toujours : aucune carte n'est demandée. */
  free: boolean;
};

function describePromo(code: string, coupon: Stripe.Coupon, period: BillingPeriod): PromoPreview {
  const price = Math.round(COMPLET_PRICES[period].amount * 100);
  const off = coupon.percent_off ? Math.round((price * coupon.percent_off) / 100) : Math.min(price, coupon.amount_off ?? 0);
  const first = Math.max(0, price - off);
  const what = coupon.percent_off ? `−${String(coupon.percent_off).replace('.', ',')} %` : `−${euroLabel(coupon.amount_off ?? 0)}`;
  const when =
    coupon.duration === 'forever'
      ? 'sur tous les paiements'
      : coupon.duration === 'repeating'
        ? `pendant ${coupon.duration_in_months} mois`
        : 'sur le 1er paiement';
  return { code, summary: `${what} ${when}`, firstCents: first, firstLabel: euroLabel(first), free: first === 0 && coupon.duration === 'forever' };
}

/** Vérifie un code saisi sur la page de paiement et montre la remise avant de payer. */
export async function checkPromo(code: string, periode: string): Promise<{ ok: PromoPreview } | { error: string }> {
  const { session } = await requireUser('/app/abonnement');
  if (!rateLimit(`promo:${session.userId}`, 10, 60_000).ok) return { error: 'Trop d’essais : patientez une minute.' };
  if (code.trim().length > 40) return { error: 'Code promotionnel inconnu ou expiré.' };
  try {
    const found = await lookupPromo(code);
    if ('error' in found) return { error: found.error };
    if (!found.id) return { error: 'Saisissez un code.' };
    return { ok: describePromo(found.code, found.coupon, periodOf(periode)) };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

async function hadSubscriptionBefore(userId: string) {
  const { count } = await createServiceClient().from('subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return (count ?? 0) > 0;
}

export type StartResult =
  | { error: string; field?: string }
  | { kind: 'setup'; clientSecret: string }
  | { kind: 'payment'; clientSecret: string }
  | { kind: 'done' };

/**
 * Étape 1 du paiement : enregistre les informations de facturation, puis
 * prépare soit l'enregistrement de la carte (essai gratuit, rien n'est débité),
 * soit le premier paiement (sans essai).
 */
export async function startSubscription(formData: FormData): Promise<StartResult> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (limited(session.userId)) return { error: 'Trop de tentatives : patientez une minute.' };
  if (profile.plan !== 'free' && !profile.comp_active) return { error: 'Vous avez déjà la formule Complet.' };

  const billing = billingFromForm(formData);
  if (!billing.success) {
    const issue = billing.error.issues[0];
    return { error: issue?.message ?? 'Informations de facturation incomplètes.', field: String(issue?.path?.[0] ?? '') };
  }
  const period = periodOf(formData.get('periode'));

  try {
    const customer = await ensureCustomer(profile, session.userId);
    await saveBillingDetails(session.userId, billing.data, customer);
    if (await currentStripeSubscription(customer)) return { error: 'Un abonnement est déjà en cours sur ce compte : rechargez la page.' };

    const promo = await lookupPromo(String(formData.get('promo') ?? ''));
    if ('error' in promo) return { error: promo.error, field: 'promo' };

    // Tentatives de paiement abandonnées : on les annule avant d'en créer une nouvelle.
    const stale = await stripe().subscriptions.list({ customer, status: 'incomplete', limit: 10 });
    await Promise.all(stale.data.map((s) => stripe().subscriptions.cancel(s.id).catch(() => null)));

    const metadata = { user_id: session.userId, plan: 'complet', periode: period, promo: promo.id ?? '' };

    // Code qui rend l'abonnement gratuit pour toujours : activation immédiate, sans carte ni essai.
    // Stripe émet une facture à 0 € (remise de 100 %), que nous reprenons à notre nom.
    if (promo.id && describePromo(promo.code, promo.coupon, period).free) {
      const sub = await stripe().subscriptions.create(
        {
          customer,
          items: [{ price: priceOfPeriod(period) }],
          discounts: [{ promotion_code: promo.id }],
          payment_behavior: 'default_incomplete',
          metadata,
        },
        { idempotencyKey: `offert-${session.userId}-${promo.id}` },
      );
      if (sub.status !== 'active') {
        await stripe().subscriptions.cancel(sub.id).catch(() => null);
        return { error: STRIPE_ERROR };
      }
      await upsertSubscription(sub, session.userId);
      revalidatePath('/app', 'layout');
      return { kind: 'done' };
    }
    if (!(await hadSubscriptionBefore(session.userId))) {
      const intent = await stripe().setupIntents.create({ customer, usage: 'off_session', allowed_payment_method_types: ['card'], metadata });
      return { kind: 'setup', clientSecret: intent.client_secret! };
    }

    const sub = await stripe().subscriptions.create({
      customer,
      items: [{ price: priceOfPeriod(period) }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      ...(promo.id ? { discounts: [{ promotion_code: promo.id }] } : {}),
      metadata,
      expand: ['latest_invoice.confirmation_secret'],
    });
    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    if (!invoice || invoice.amount_due === 0) {
      await upsertSubscription(sub, session.userId);
      return { kind: 'done' };
    }
    const secret = invoice.confirmation_secret?.client_secret;
    if (!secret) return { error: STRIPE_ERROR };
    return { kind: 'payment', clientSecret: secret };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

/** Vérifie qu'un SetupIntent appartient bien au membre et a réussi ; renvoie le moyen de paiement. */
async function ownSetupIntent(setupIntentId: string, customer: string, userId: string) {
  if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId)) return null;
  const si = await stripe().setupIntents.retrieve(setupIntentId);
  const siCustomer = typeof si.customer === 'string' ? si.customer : si.customer?.id;
  if (siCustomer !== customer || si.status !== 'succeeded' || (si.metadata?.user_id && si.metadata.user_id !== userId)) return null;
  const pm = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
  return pm ? { si, pm } : null;
}

/** Démarre l'essai gratuit une fois la carte enregistrée (aussi appelé au retour d'une validation bancaire). */
export async function activateTrial(setupIntentId: string): Promise<{ ok: true } | { error: string }> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) return { error: 'Compte de paiement introuvable.' };
  try {
    const own = await ownSetupIntent(setupIntentId, profile.stripe_customer_id, session.userId);
    if (!own) return { error: 'La carte n’a pas pu être vérifiée. Recommencez.' };
    if (await currentStripeSubscription(profile.stripe_customer_id)) return { ok: true };
    await stripe().customers.update(profile.stripe_customer_id, { invoice_settings: { default_payment_method: own.pm } });
    const period = periodOf(own.si.metadata?.periode ?? null);
    const sub = await stripe().subscriptions.create(
      {
        customer: profile.stripe_customer_id,
        items: [{ price: priceOfPeriod(period) }],
        trial_period_days: TRIAL_DAYS,
        default_payment_method: own.pm,
        payment_settings: { payment_method_types: ['card'] },
        ...(own.si.metadata?.promo ? { discounts: [{ promotion_code: own.si.metadata.promo }] } : {}),
        metadata: { user_id: session.userId, plan: 'complet', periode: period },
      },
      { idempotencyKey: `essai-${own.si.id}` },
    );
    await upsertSubscription(sub, session.userId);
    revalidatePath('/app', 'layout');
    return { ok: true };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

/** Après un premier paiement réussi : met l'écran à jour sans attendre le webhook. */
export async function refreshSubscription(): Promise<void> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) return;
  const sub = await currentStripeSubscription(profile.stripe_customer_id).catch(() => null);
  if (sub) await upsertSubscription(sub, session.userId);
  revalidatePath('/app', 'layout');
}

async function ownSubscription() {
  const { session, profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) return null;
  const sub = await currentStripeSubscription(profile.stripe_customer_id);
  return sub ? { session, profile, sub } : null;
}

const done = (message: string): FormState => {
  revalidatePath('/app', 'layout');
  return { ok: true, message };
};

/** Mensuel ↔ annuel. Pendant l'essai : immédiat. Sinon : à la prochaine échéance (sans paiement surprise). */
export async function changePeriod(_prev: FormState, formData: FormData): Promise<FormState> {
  const own = await ownSubscription();
  if (!own) return { error: 'Aucun abonnement en cours.' };
  if (limited(own.session.userId)) return { error: 'Trop de tentatives : patientez une minute.' };
  const target = periodOf(formData.get('periode'));
  const { sub } = own;
  try {
    const { result } = await applyPeriodChange(sub, target, own.session.userId);
    const label = target === 'annuel' ? 'annuelle' : 'mensuelle';
    if (result === 'deja') return { ok: true, message: 'C’est déjà votre formule.' };
    if (result === 'annule') return done('Changement de formule annulé.');
    if (result === 'essai') return done(`C’est noté : à la fin de l’essai, vous passerez en formule ${label}.`);
    return done(`C’est noté : vous passerez en formule ${label} à la prochaine échéance.`);
  } catch (err) {
    if (err instanceof Error && !('type' in err)) return { error: err.message };
    return { error: stripeMessage(err) };
  }
}

/** Résiliation à la fin de la période payée (ou de l'essai) : rien n'est plus débité. */
export async function cancelSubscription(): Promise<FormState> {
  const own = await ownSubscription();
  if (!own) return { error: 'Aucun abonnement en cours.' };
  try {
    const scheduleId = typeof own.sub.schedule === 'string' ? own.sub.schedule : own.sub.schedule?.id;
    if (scheduleId) await stripe().subscriptionSchedules.release(scheduleId);
    const updated = await stripe().subscriptions.update(own.sub.id, { cancel_at_period_end: true });
    await upsertSubscription(updated, own.session.userId);
    return done('Résiliation enregistrée : vous gardez la formule Complet jusqu’à la fin de la période.');
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

export async function resumeSubscription(): Promise<FormState> {
  const own = await ownSubscription();
  if (!own) return { error: 'Aucun abonnement en cours.' };
  try {
    const updated = await stripe().subscriptions.update(own.sub.id, { cancel_at_period_end: false, cancel_at: '' });
    await upsertSubscription(updated, own.session.userId);
    return done('Parfait : votre abonnement continue.');
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

/** Changement de carte, étape 1 : formulaire Stripe d'enregistrement de carte. */
export async function startCardUpdate(): Promise<{ clientSecret: string } | { error: string }> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) return { error: 'Aucun abonnement en cours.' };
  if (limited(session.userId)) return { error: 'Trop de tentatives : patientez une minute.' };
  try {
    const intent = await stripe().setupIntents.create({
      customer: profile.stripe_customer_id,
      usage: 'off_session',
      allowed_payment_method_types: ['card'],
      metadata: { user_id: session.userId, objet: 'changement_carte' },
    });
    return { clientSecret: intent.client_secret! };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

/**
 * Changement de carte, étape 2 : la nouvelle carte devient celle de l'abonnement.
 * Paiement en retard : on le règle tout de suite avec la nouvelle carte.
 * Si la banque demande une validation, on renvoie de quoi l'afficher.
 */
export async function completeCardUpdate(setupIntentId: string): Promise<{ ok: true; message: string; actionSecret?: string } | { error: string }> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (!profile.stripe_customer_id) return { error: 'Aucun abonnement en cours.' };
  try {
    const own = await ownSetupIntent(setupIntentId, profile.stripe_customer_id, session.userId);
    if (!own) return { error: 'La carte n’a pas pu être vérifiée. Recommencez.' };
    await stripe().customers.update(profile.stripe_customer_id, { invoice_settings: { default_payment_method: own.pm } });
    const sub = await currentStripeSubscription(profile.stripe_customer_id);
    if (!sub) return { ok: true, message: 'Carte enregistrée.' };
    await stripe().subscriptions.update(sub.id, { default_payment_method: own.pm });
    revalidatePath('/app/abonnement');

    if (sub.status === 'past_due') {
      const open = await stripe().invoices.list({ subscription: sub.id, status: 'open', limit: 1 });
      const invoice = open.data[0];
      if (invoice?.id) {
        try {
          await stripe().invoices.pay(invoice.id, { payment_method: own.pm, off_session: false });
          return { ok: true, message: 'Carte enregistrée et paiement en attente réglé. Merci !' };
        } catch {
          const fresh = await stripe().invoices.retrieve(invoice.id, { expand: ['confirmation_secret'] });
          if (fresh.status === 'paid') return { ok: true, message: 'Carte enregistrée et paiement réglé. Merci !' };
          const secret = fresh.confirmation_secret?.client_secret;
          if (secret) return { ok: true, message: 'Votre banque demande une validation du paiement.', actionSecret: secret };
          return { error: 'Carte enregistrée, mais le paiement en attente a été refusé. Essayez une autre carte.' };
        }
      }
    }
    return { ok: true, message: 'Carte enregistrée : elle servira aux prochains paiements.' };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}

/** Informations de facturation (nom, adresse, SIRET) : reprises sur les prochaines factures. */
export async function updateBilling(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, profile } = await requireUser('/app/abonnement');
  if (limited(session.userId)) return { error: 'Trop de tentatives : patientez une minute.' };
  const billing = billingFromForm(formData);
  if (!billing.success) return { error: billing.error.issues[0]?.message ?? 'Informations incomplètes.' };
  try {
    await saveBillingDetails(session.userId, billing.data, profile.stripe_customer_id);
    revalidatePath('/app/abonnement');
    return { ok: true, message: `Enregistré. Les prochaines factures ${SITE.name} porteront ces informations (les factures déjà émises ne changent pas).` };
  } catch (err) {
    return { error: stripeMessage(err) };
  }
}
