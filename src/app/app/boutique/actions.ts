'use server';

import { headers } from 'next/headers';
import { getProfile, getSession, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/admin';
import { priceCart, settleShopPayment, ShopError, startShopPayment } from '@/lib/shop';
import { printfulConfigured } from '@/lib/printful';
import type { CartLine } from '@/lib/shop-shared';

export type CartQuote =
  | {
      ok: true;
      items: { variantId: number; productId: number; name: string; detail: string; image: string | null; quantity: number; unitCents: number; listCents: number }[];
      subtotal: number;
      discount: number;
      discountLabel: string | null;
      shipping: number;
      delay: string | null;
      total: number;
    }
  | { ok: false; error: string };

const friendly = (err: unknown) => {
  if (err instanceof ShopError) return err.message;
  console.error('[boutique]', err);
  return 'La boutique ne répond pas pour le moment. Réessayez dans quelques minutes.';
};

/** Prix du panier (lecture seule : utilisable aussi depuis la démo). */
export async function quoteCart(lines: CartLine[]): Promise<CartQuote> {
  const session = await getSession();
  const profile = session ? await getProfile() : null;
  if (!session || !profile) return { ok: false, error: 'Connectez-vous pour voir votre panier.' };
  if (!printfulConfigured()) return { ok: false, error: 'La boutique n’est pas encore ouverte.' };
  if (!rateLimit(`boutique-devis:${session.userId}`, 40, 60_000).ok) return { ok: false, error: 'Trop de demandes, patientez une minute.' };
  if (!Array.isArray(lines) || !lines.length) return { ok: false, error: 'Votre panier est vide.' };
  try {
    const p = await priceCart(lines, profile.plan);
    return {
      ok: true,
      items: p.items.map((i) => ({ variantId: i.sync_variant_id, productId: i.product_id, name: i.name, detail: i.detail, image: i.image, quantity: i.quantity, unitCents: i.unit_cents, listCents: i.list_cents })),
      subtotal: p.subtotal,
      discount: p.discount,
      discountLabel: p.discountLabel,
      shipping: p.shipping.cents,
      delay: p.shipping.minDays && p.shipping.maxDays ? `${p.shipping.minDays} à ${p.shipping.maxDays} jours ouvrés` : null,
      total: p.total,
    };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

const recipientSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom du destinataire.').max(120),
  address1: z.string().trim().min(3, 'Indiquez l’adresse de livraison.').max(200),
  address2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1, 'Indiquez la ville.').max(100),
  zip: z.string().trim().regex(/^\d{5}$/, 'Code postal à 5 chiffres.'),
  country_code: z.literal('FR', { message: 'Livraison en France uniquement.' }),
  phone: z.string().trim().min(6, 'Indiquez un téléphone pour le livreur.').max(30),
});
export type RecipientInput = z.input<typeof recipientSchema>;

/** Étape 1 du paiement : crée la commande et le paiement Stripe, réglé ensuite dans la page. */
export async function startPayment(
  lines: CartLine[],
  recipient: RecipientInput,
  expectedTotal: number,
  acceptedTerms: boolean,
): Promise<{ ok: true; orderId: string; clientSecret: string } | { ok: false; error: string; changed?: boolean }> {
  // Compte de démonstration : requireUser renvoie vers la création de compte.
  const { session, profile } = await requireUser('/app/boutique/panier');
  if (!acceptedTerms) return { ok: false, error: 'Cochez la case des conditions de vente pour continuer.' };
  if (!printfulConfigured()) return { ok: false, error: 'La boutique n’est pas encore ouverte.' };
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu';
  if (!rateLimit(`boutique-paiement:${session.userId}`, 8, 10 * 60_000).ok || !rateLimit(`boutique-paiement-ip:${ip}`, 15, 10 * 60_000).ok) {
    return { ok: false, error: 'Trop de tentatives, patientez quelques minutes.' };
  }
  if (!Array.isArray(lines) || !lines.length) return { ok: false, error: 'Votre panier est vide.' };
  const parsed = recipientSchema.safeParse(recipient);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Adresse de livraison incomplète.' };
  try {
    const r = await startShopPayment({
      userId: session.userId,
      email: profile.email,
      customerId: profile.stripe_customer_id,
      plan: profile.plan,
      lines,
      recipient: { ...parsed.data, address2: parsed.data.address2 || null },
      expectedTotal: Math.round(Number(expectedTotal)),
    });
    return { ok: true, ...r };
  } catch (err) {
    const changed = err instanceof ShopError && err.message.startsWith('Le total a changé');
    return { ok: false, error: friendly(err), changed };
  }
}

/** Étape 2 : le paiement vient d'aboutir dans la page ; la commande part tout de suite (le webhook Stripe sert de filet). */
export async function finishPayment(orderId: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false };
  const { data } = await createServiceClient().from('shop_orders').select('stripe_payment_intent, user_id').eq('id', orderId).maybeSingle();
  if (!data?.stripe_payment_intent || data.user_id !== session.userId) return { ok: false };
  try {
    await settleShopPayment(data.stripe_payment_intent as string);
    return { ok: true };
  } catch (err) {
    console.error('[boutique] fin de paiement', orderId, err);
    return { ok: false };
  }
}
