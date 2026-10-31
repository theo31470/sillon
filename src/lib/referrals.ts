import 'server-only';
import { randomInt } from 'node:crypto';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { COMPLET_PRICES } from '@/lib/plans';
import { euros, notifyBilling } from '@/lib/email/billing';

/**
 * Parrainage : chaque membre a un code personnel. La personne invitée a un mois
 * offert sur son premier paiement (en plus de l'essai gratuit) ; le parrain
 * reçoit un mois de crédit dès que son filleul a réellement payé une première fois.
 */

/** Valeur d'un mois de formule Complet (mensuel), en centimes. */
export const REFERRAL_REWARD_CENTS = Math.round(COMPLET_PRICES.mensuel.amount * 100);
export const REFERRAL_COUPON_ID = 'parrainage-1-mois';
export const REFERRAL_COOKIE = 'tc_parrain';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const isReferralCodeFormat = (code: string) => /^[A-Z0-9]{4,12}$/.test(code);
export const referralLink = (code: string) => `${env.siteUrl().replace(/\/$/, '')}/p/${code}`;

/** Code personnel du membre, créé à la première demande. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const db = createServiceClient();
  const { data } = await db.from('profiles').select('referral_code').eq('id', userId).single();
  if (data?.referral_code) return data.referral_code as string;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const { data: updated, error } = await db.from('profiles').update({ referral_code: code }).eq('id', userId).is('referral_code', null).select('referral_code');
    if (!error && updated?.length) return code;
    if (!error) {
      // Créé entre-temps par une autre requête.
      const { data: again } = await db.from('profiles').select('referral_code').eq('id', userId).single();
      if (again?.referral_code) return again.referral_code as string;
    }
  }
  throw new Error('Création du code de parrainage impossible');
}

/** Coupon Stripe du filleul (un mois offert sur le premier paiement), créé au premier besoin. */
export async function referralCoupon(): Promise<Stripe.Coupon> {
  try {
    return await stripe().coupons.retrieve(REFERRAL_COUPON_ID);
  } catch (err) {
    if ((err as { code?: string }).code !== 'resource_missing') throw err;
    return await stripe().coupons.create(
      { id: REFERRAL_COUPON_ID, amount_off: REFERRAL_REWARD_CENTS, currency: 'eur', duration: 'once', name: 'Parrainage : 1 mois offert', metadata: { usage: 'parrainage' } },
      { idempotencyKey: `coupon-${REFERRAL_COUPON_ID}-${REFERRAL_REWARD_CENTS}` },
    );
  }
}

/**
 * Parrain correspondant à un code saisi par un futur abonné.
 * null : ce n'est pas un code de parrainage. { error } : code de parrainage inutilisable ici.
 */
export async function referrerForCode(code: string, refereeId: string): Promise<{ referrerId: string } | { error: string } | null> {
  const clean = code.trim().toUpperCase();
  if (!isReferralCodeFormat(clean)) return null;
  const db = createServiceClient();
  const { data: referrer } = await db.from('profiles').select('id, suspended').eq('referral_code', clean).maybeSingle();
  if (!referrer) return null;
  if (referrer.id === refereeId) return { error: 'C’est votre propre code de parrainage : partagez-le plutôt autour de vous.' };
  if (referrer.suspended) return { error: 'Ce code de parrainage n’est plus valable.' };
  const [{ count: subs }, { data: already }] = await Promise.all([
    db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', refereeId),
    db.from('referrals').select('id').eq('referee_id', refereeId).maybeSingle(),
  ]);
  if ((subs ?? 0) > 0 || already) return { error: 'Le parrainage est réservé à un premier abonnement.' };
  return { referrerId: referrer.id as string };
}

/** Enregistre le lien parrain → filleul quand l'abonnement du filleul démarre. */
export async function recordReferral(referrerId: string, refereeId: string) {
  if (!referrerId || referrerId === refereeId) return;
  const { error } = await createServiceClient().from('referrals').insert({ referrer_id: referrerId, referee_id: refereeId });
  if (error && error.code !== '23505') console.error('[parrainage] enregistrement', error.message);
}

async function customerFor(userId: string) {
  const db = createServiceClient();
  const { data: p } = await db.from('profiles').select('email, full_name, farm_name, stripe_customer_id').eq('id', userId).single();
  if (!p) return null;
  if (p.stripe_customer_id) return p.stripe_customer_id as string;
  const customer = await stripe().customers.create(
    { email: p.email as string, name: (p.farm_name || p.full_name || undefined) as string | undefined, metadata: { user_id: userId }, preferred_locales: ['fr'] },
    { idempotencyKey: `client-${userId}` },
  );
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId).is('stripe_customer_id', null);
  const { data } = await db.from('profiles').select('stripe_customer_id').eq('id', userId).single();
  return (data?.stripe_customer_id as string) ?? customer.id;
}

/**
 * Premier vrai paiement d'un filleul : un mois de crédit pour le parrain, déduit
 * automatiquement de son prochain paiement (solde du client Stripe).
 */
export async function rewardReferrer(refereeId: string | null) {
  if (!refereeId) return;
  const db = createServiceClient();
  const { data: ref } = await db.from('referrals').select('id, referrer_id').eq('referee_id', refereeId).eq('status', 'en_attente').maybeSingle();
  if (!ref) return;
  const customer = await customerFor(ref.referrer_id as string);
  if (!customer) return;
  // Réservé avant l'appel à Stripe : une seule récompense, même si l'événement arrive deux fois.
  const { data: claimed } = await db
    .from('referrals')
    .update({ status: 'recompense', reward_cents: REFERRAL_REWARD_CENTS, rewarded_at: new Date().toISOString() })
    .eq('id', ref.id)
    .eq('status', 'en_attente')
    .select('id');
  if (!claimed?.length) return;
  try {
    const txn = await stripe().customers.createBalanceTransaction(
      customer,
      { amount: -REFERRAL_REWARD_CENTS, currency: 'eur', description: 'Parrainage : 1 mois offert', metadata: { parrainage: ref.id as string } },
      { idempotencyKey: `parrainage-${ref.id}` },
    );
    await db.from('referrals').update({ stripe_balance_txn: txn.id }).eq('id', ref.id);
  } catch (err) {
    // Stripe a échoué : on remet la récompense en attente, Stripe renverra l'événement.
    await db.from('referrals').update({ status: 'en_attente', reward_cents: 0, rewarded_at: null }).eq('id', ref.id);
    throw err;
  }
  await notifyBilling('parrainage', { userId: ref.referrer_id as string }, { amount: euros(REFERRAL_REWARD_CENTS) }, `parrainage-${ref.id}`);
}

export type ReferralStats = { code: string; link: string; pending: number; rewarded: number; creditCents: number };

export async function referralStats(userId: string, stripeCustomerId: string | null): Promise<ReferralStats> {
  const code = await ensureReferralCode(userId);
  const db = createServiceClient();
  const { data } = await db.from('referrals').select('status').eq('referrer_id', userId);
  let creditCents = 0;
  if (stripeCustomerId) {
    const c = await stripe().customers.retrieve(stripeCustomerId).catch(() => null);
    if (c && !('deleted' in c && c.deleted)) creditCents = Math.max(0, -((c as Stripe.Customer).balance ?? 0));
  }
  return {
    code,
    link: referralLink(code),
    pending: (data ?? []).filter((r) => r.status === 'en_attente').length,
    rewarded: (data ?? []).filter((r) => r.status === 'recompense').length,
    creditCents,
  };
}
