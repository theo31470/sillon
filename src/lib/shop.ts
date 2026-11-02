import 'server-only';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { stripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/email/send';
import { shopEmail, type ShopTemplate } from '@/lib/email/templates';
import { alertAdmins } from '@/lib/email/alerts';
import { fetchOrder, liveProduct, shippingQuote, submitOrder, type PfOrder } from '@/lib/printful';
import { formatEuros } from '@/lib/format';
import type { Plan } from '@/lib/types';
import { SHOP_MAX_LINES, SHOP_MAX_QTY, shopDiscountPercent, type CartLine } from '@/lib/shop-shared';

/**
 * Boutique : prix, paiement intégré à la page (Stripe), transmission à Printful et suivi.
 * Les prix viennent toujours de Printful au moment de payer (jamais du navigateur).
 */

export type ShopItem = {
  product_id: number;
  sync_variant_id: number;
  variant_id: number;
  name: string;
  detail: string;
  image: string | null;
  quantity: number;
  /** Prix payé à l'unité (remise comprise). */
  unit_cents: number;
  /** Prix public à l'unité. */
  list_cents: number;
};

export type ShopOrderRow = {
  id: string;
  user_id: string | null;
  email: string;
  status: 'pending' | 'paid' | 'submitted' | 'shipped' | 'failed' | 'canceled' | 'refunded' | 'abandoned';
  items: ShopItem[];
  subtotal_cents: number;
  discount_cents: number;
  discount_label: string | null;
  shipping_cents: number;
  shipping_method: string;
  shipping_label: string | null;
  total_cents: number;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  recipient: { name: string; address1: string; address2?: string | null; city: string; zip: string; country_code: string; phone?: string | null } | null;
  printful_order_id: number | null;
  printful_status: string | null;
  tracking: { carrier: string; service: string; number: string; url: string; shipped_at: string | null }[];
  error: string | null;
  created_at: string;
  paid_at: string | null;
  submitted_at: string | null;
  shipped_at: string | null;
};

export const orderReference = (id: string) => `B-${id.slice(0, 8).toUpperCase()}`;

export class ShopError extends Error {}

/** Recalcule le panier d'après Printful : prix, disponibilité, remise et frais de port. */
export async function priceCart(lines: CartLine[], plan: Plan) {
  const clean = lines
    .filter((l) => Number.isInteger(l.productId) && Number.isInteger(l.variantId) && Number.isInteger(l.quantity) && l.quantity > 0)
    .slice(0, SHOP_MAX_LINES)
    .map((l) => ({ ...l, quantity: Math.min(l.quantity, SHOP_MAX_QTY) }));
  if (!clean.length) throw new ShopError('Votre panier est vide.');

  const percent = shopDiscountPercent(plan);
  const products = new Map<number, Awaited<ReturnType<typeof liveProduct>>>();
  for (const id of new Set(clean.map((l) => l.productId))) products.set(id, await liveProduct(id));

  const items: ShopItem[] = [];
  for (const l of clean) {
    const product = products.get(l.productId);
    const v = product?.variants.find((x) => x.id === l.variantId);
    if (!product || !v) throw new ShopError('Un article de votre panier n’est plus en vente. Retirez-le pour continuer.');
    if (!v.available) throw new ShopError(`« ${product.name}${v.size ? `, ${v.size}` : ''} » est en rupture pour le moment. Retirez-le pour continuer.`);
    const unit = Math.round((v.priceCents * (100 - percent)) / 100);
    const same = items.find((i) => i.sync_variant_id === v.id);
    if (same) same.quantity = Math.min(same.quantity + l.quantity, SHOP_MAX_QTY);
    else
      items.push({
        product_id: product.id,
        sync_variant_id: v.id,
        variant_id: v.catalogVariantId,
        name: product.name,
        detail: [v.color, v.size].filter(Boolean).join(', '),
        image: v.image,
        quantity: l.quantity,
        unit_cents: unit,
        list_cents: v.priceCents,
      });
  }
  const subtotal = items.reduce((t, i) => t + i.list_cents * i.quantity, 0);
  const discount = items.reduce((t, i) => t + (i.list_cents - i.unit_cents) * i.quantity, 0);
  const shipping = await shippingQuote(items.map((i) => ({ catalogVariantId: i.variant_id, quantity: i.quantity })));
  return {
    items,
    subtotal,
    discount,
    discountLabel: discount > 0 ? `Remise formule Complet (−${percent} %)` : null,
    shipping,
    total: subtotal - discount + shipping.cents,
  };
}

const deliveryText = (min: number | null, max: number | null) => (min && max ? `${min} à ${max} jours ouvrés` : null);

export type ShopRecipient = NonNullable<ShopOrderRow['recipient']>;

/**
 * Crée la commande (en attente de paiement) et son paiement Stripe, réglé ensuite
 * directement sur la page du site (formulaire de carte intégré, comme l'abonnement).
 */
export async function startShopPayment(params: { userId: string; email: string; customerId: string | null; plan: Plan; lines: CartLine[]; recipient: ShopRecipient; expectedTotal: number }) {
  const priced = await priceCart(params.lines, params.plan);
  // Prix ou frais de port changés depuis l'affichage du panier : on le dit plutôt que de débiter autre chose.
  if (priced.total !== params.expectedTotal) throw new ShopError('Le total a changé entre-temps (prix ou frais de port mis à jour). Vérifiez le nouveau montant puis payez à nouveau.');
  const db = createServiceClient();
  const { data: order, error } = await db
    .from('shop_orders')
    .insert({
      user_id: params.userId,
      email: params.email,
      items: priced.items,
      subtotal_cents: priced.subtotal,
      discount_cents: priced.discount,
      discount_label: priced.discountLabel,
      shipping_cents: priced.shipping.cents,
      shipping_method: priced.shipping.method,
      shipping_label: deliveryText(priced.shipping.minDays, priced.shipping.maxDays),
      total_cents: priced.total,
      recipient: params.recipient,
    })
    .select('id')
    .single();
  if (error || !order) throw new Error(`Commande impossible à créer : ${error?.message}`);
  const orderId = order.id as string;

  const intent = await stripe().paymentIntents.create(
    {
      amount: priced.total,
      currency: 'eur',
      // Carte (Apple Pay et Google Pay compris) ou PayPal : paiement confirmé tout de suite, la commande part aussitôt.
      allowed_payment_method_types: ['card', 'paypal'],
      ...(params.customerId ? { customer: params.customerId } : {}),
      description: `Boutique Tracteurs & Co, commande ${orderReference(orderId)}`,
      statement_descriptor_suffix: 'BOUTIQUE',
      metadata: { kind: 'boutique', order_id: orderId, user_id: params.userId },
      // Pas d'adresse ici : le champ adresse de Stripe l'ajoute à la confirmation (Stripe refuse qu'elle soit posée
      // côté serveur puis modifiée côté navigateur). L'adresse qui fait foi est celle enregistrée sur la commande.
    },
    { idempotencyKey: `boutique-${orderId}` },
  );
  await db.from('shop_orders').update({ stripe_payment_intent: intent.id, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (!intent.client_secret) throw new Error('Stripe n’a pas renvoyé de paiement');
  return { orderId, clientSecret: intent.client_secret };
}

// ---------------------------------------------------------------------
// Après paiement (retour du navigateur, webhook Stripe, tâche quotidienne)
// ---------------------------------------------------------------------

async function loadOrder(id: string) {
  const { data } = await createServiceClient().from('shop_orders').select('*').eq('id', id).maybeSingle();
  return (data as ShopOrderRow | null) ?? null;
}

async function updateOrder(id: string, patch: Partial<ShopOrderRow>) {
  const { error } = await createServiceClient()
    .from('shop_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Commande ${id} : ${error.message}`);
}

/**
 * Paiement réussi : la commande passe « payée », l'e-mail de confirmation part et
 * la commande est transmise à Printful. Appelée par le navigateur juste après le
 * paiement, par le webhook Stripe et par la tâche quotidienne : seul le premier
 * appel fait quelque chose. L'état du paiement est toujours relu chez Stripe.
 */
export async function settleShopPayment(intentOrId: Stripe.PaymentIntent | string) {
  const intent = typeof intentOrId === 'string' ? await stripe().paymentIntents.retrieve(intentOrId) : intentOrId;
  const orderId = intent.metadata?.kind === 'boutique' ? intent.metadata.order_id : null;
  if (!orderId) return null;
  const order = await loadOrder(orderId);
  if (!order) throw new Error(`Commande boutique introuvable : ${orderId}`);
  if (intent.status !== 'succeeded' || order.stripe_payment_intent !== intent.id || intent.amount_received < order.total_cents) return order;

  if (order.status === 'pending' || order.status === 'abandoned') {
    // Passage à « payée » une seule fois, même si deux appels arrivent en même temps.
    const { data: claimed } = await createServiceClient()
      .from('shop_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .in('status', ['pending', 'abandoned'])
      .select('id');
    if (claimed?.length) await notifyShop('commande_confirmee', (await loadOrder(orderId)) ?? order);
  }
  return submitToPrintful(orderId);
}

/** Commandes dont le paiement a abouti sans que le site l'ait encore noté (navigateur fermé pendant la validation bancaire). */
export async function settlePendingShopPayments() {
  const { data } = await createServiceClient()
    .from('shop_orders')
    .select('id, stripe_payment_intent')
    .eq('status', 'pending')
    .not('stripe_payment_intent', 'is', null)
    .gte('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(50);
  let settled = 0;
  for (const o of data ?? []) {
    try {
      const r = await settleShopPayment(o.stripe_payment_intent as string);
      if (r && r.status !== 'pending') settled++;
    } catch (err) {
      console.error('[boutique] rattrapage paiement', o.id, err);
    }
  }
  return settled;
}

/** Transmet une commande payée à Printful (aussi utilisé par le bouton « Renvoyer » de l'admin). */
export async function submitToPrintful(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order || !['paid', 'failed'].includes(order.status) || order.printful_order_id) return order;
  if (!order.recipient?.address1) {
    await updateOrder(orderId, { status: 'failed', error: 'Adresse de livraison manquante' });
    return loadOrder(orderId);
  }
  try {
    // Déjà transmise (Stripe a renvoyé l'événement) : on reprend la commande existante.
    const existing = await fetchOrder(orderId);
    const pf =
      existing ??
      (await submitOrder({
        orderId,
        shippingMethod: order.shipping_method,
        recipient: { ...order.recipient, email: order.email },
        items: order.items.map((i) => ({ sync_variant_id: i.sync_variant_id, quantity: i.quantity, unit_cents: i.unit_cents })),
        costs: { subtotal: order.subtotal_cents, discount: order.discount_cents, shipping: order.shipping_cents, total: order.total_cents },
      }));
    await updateOrder(orderId, { status: 'submitted', printful_order_id: pf.id, printful_status: pf.status, submitted_at: new Date().toISOString(), error: null });
  } catch (err) {
    // Deux notifications Stripe simultanées : l'autre a peut-être déjà transmis la commande.
    const already = await fetchOrder(orderId).catch(() => null);
    if (already) {
      await updateOrder(orderId, { status: 'submitted', printful_order_id: already.id, printful_status: already.status, submitted_at: new Date().toISOString(), error: null });
      return loadOrder(orderId);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[boutique] transmission Printful', orderId, message);
    await updateOrder(orderId, { status: 'failed', error: message.slice(0, 500) });
    await alertAdmins(
      `boutique_${orderId.slice(0, 8)}`,
      `Commande ${orderReference(orderId)} non transmise à Printful`,
      [`Le client a payé ${formatEuros(order.total_cents)}, mais Printful a refusé la commande :`, message, 'Corrigez le problème (adresse, produit, moyen de paiement Printful) puis cliquez sur « Renvoyer à Printful », ou remboursez depuis Stripe.'],
      `${env.siteUrl().replace(/\/$/, '')}/admin/boutique`,
    );
  }
  return loadOrder(orderId);
}

/** Remboursement fait dans Stripe (total ou partiel). */
export async function onShopRefund(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { data } = await createServiceClient().from('shop_orders').select('*').eq('stripe_payment_intent', pi).maybeSingle();
  const order = data as ShopOrderRow | null;
  if (!order || !charge.refunded || order.status === 'refunded') return;
  await updateOrder(order.id, { status: 'refunded' });
  await notifyShop('commande_remboursee', order);
}

// ---------------------------------------------------------------------
// Suivi Printful
// ---------------------------------------------------------------------

const shipmentsOf = (pf: PfOrder) =>
  (pf.shipments ?? [])
    .filter((s) => s.tracking_number)
    .map((s) => ({
      carrier: s.carrier,
      service: s.service,
      number: s.tracking_number,
      url: s.tracking_url,
      shipped_at: s.shipped_at ? new Date(s.shipped_at * 1000).toISOString() : (s.ship_date ?? null),
    }));

/** Relit la commande chez Printful et met à jour statut et suivi (webhook Printful, tâche quotidienne). */
export async function syncShopOrder(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order || !['submitted', 'shipped', 'failed'].includes(order.status) || !order.printful_order_id) return order;
  const pf = await fetchOrder(orderId);
  if (!pf) return order;
  const tracking = shipmentsOf(pf);
  const patch: Partial<ShopOrderRow> = { printful_status: pf.status, tracking };
  const wasShipped = order.status === 'shipped';
  if (tracking.length && !wasShipped && !['canceled', 'failed'].includes(pf.status)) {
    patch.status = 'shipped';
    patch.shipped_at = tracking[0].shipped_at ?? new Date().toISOString();
  } else if (pf.status === 'canceled' && order.status !== 'canceled') {
    patch.status = 'canceled';
  } else if ((pf.status === 'failed' || pf.status === 'onhold') && order.status === 'submitted') {
    patch.status = 'failed';
    patch.error = pf.status === 'onhold' ? 'Commande mise en attente par Printful' : 'Commande refusée par Printful';
  }
  await updateOrder(orderId, patch);
  const fresh = (await loadOrder(orderId))!;
  if (patch.status === 'shipped') await notifyShop('commande_expediee', fresh);
  if (patch.status === 'failed' || patch.status === 'canceled') {
    await notifyShop('commande_retardee', fresh);
    await alertAdmins(
      `boutique_${orderId.slice(0, 8)}`,
      `Commande ${orderReference(orderId)} : ${patch.status === 'canceled' ? 'annulée' : 'bloquée'} chez Printful`,
      [`Statut Printful : ${pf.status}. Le client a payé ${formatEuros(order.total_cents)}.`, 'Vérifiez la commande dans Printful, puis relancez-la ou remboursez le client depuis Stripe.'],
      `${env.siteUrl().replace(/\/$/, '')}/admin/boutique`,
    );
  }
  return fresh;
}

/** Commandes en cours chez Printful : relues une fois par jour, au cas où une notification se serait perdue. */
export async function syncOpenShopOrders() {
  const { data } = await createServiceClient()
    .from('shop_orders')
    .select('id')
    .eq('status', 'submitted')
    .gte('submitted_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
    .limit(50);
  let synced = 0;
  for (const o of data ?? []) {
    try {
      await syncShopOrder(o.id as string);
      synced++;
    } catch (err) {
      console.error('[boutique] suivi', o.id, err);
    }
  }
  synced += await settlePendingShopPayments();
  // Commandes jamais payées : retirées des listes au bout de 2 jours.
  await createServiceClient()
    .from('shop_orders')
    .update({ status: 'abandoned' })
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString());
  return synced;
}

// ---------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------

async function notifyShop(template: ShopTemplate, order: ShopOrderRow) {
  try {
    const { data: profile } = order.user_id ? await createServiceClient().from('profiles').select('full_name').eq('id', order.user_id).maybeSingle() : { data: null };
    const r = order.recipient;
    await sendEmail(
      {
        to: order.email,
        email: shopEmail(
          template,
          {
            name: profile?.full_name ?? r?.name,
            reference: orderReference(order.id),
            lines: order.items.map((i) => `${i.quantity} × ${i.name}${i.detail ? ` (${i.detail})` : ''} — ${formatEuros(i.unit_cents * i.quantity)}`),
            total: formatEuros(order.total_cents),
            shipping: order.shipping_cents ? formatEuros(order.shipping_cents) : 'offerte',
            discount: order.discount_cents ? formatEuros(order.discount_cents) : null,
            address: r ? [r.name, r.address1, r.address2, `${r.zip} ${r.city}`].filter(Boolean).join(', ') : null,
            delay: order.shipping_label,
            tracking: order.tracking.map((t) => ({ carrier: t.carrier, number: t.number, url: t.url })),
          },
          env.siteUrl(),
        ),
        kind: 'facturation',
        template: `boutique_${template}`,
        userId: order.user_id,
      },
      { idempotencyKey: `boutique-${order.id}-${template}` },
    );
  } catch (err) {
    console.error('[boutique] e-mail', template, err);
  }
}
