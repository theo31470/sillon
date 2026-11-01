'use server';

import { headers } from 'next/headers';
import { getProfile, getSession, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { priceCart, ShopError, startCheckout } from '@/lib/shop';
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

/** Passe au paiement : crée la commande et renvoie l'adresse de la page Stripe. */
export async function checkoutCart(lines: CartLine[], acceptedTerms: boolean): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Compte de démonstration : requireUser renvoie vers la création de compte.
  const { session, profile } = await requireUser('/app/boutique/panier');
  if (!acceptedTerms) return { ok: false, error: 'Cochez la case des conditions de vente pour continuer.' };
  if (!printfulConfigured()) return { ok: false, error: 'La boutique n’est pas encore ouverte.' };
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnu';
  if (!rateLimit(`boutique-paiement:${session.userId}`, 8, 10 * 60_000).ok || !rateLimit(`boutique-paiement-ip:${ip}`, 15, 10 * 60_000).ok) {
    return { ok: false, error: 'Trop de tentatives, patientez quelques minutes.' };
  }
  if (!Array.isArray(lines) || !lines.length) return { ok: false, error: 'Votre panier est vide.' };
  try {
    const url = await startCheckout({ userId: session.userId, email: profile.email, customerId: profile.stripe_customer_id, plan: profile.plan, lines });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
