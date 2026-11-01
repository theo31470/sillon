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
 * Boutique : prix, paiement Stripe Checkout, transmission à Printful et suivi.
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

/** Crée la commande (en attente de paiement) et la page de paiement Stripe. Renvoie l'adresse de paiement. */
export async function startCheckout(params: { userId: string; email: string; customerId: string | null; plan: Plan; lines: CartLine[] }) {
  const priced = await priceCart(params.lines, params.plan);
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
    })
    .select('id')
    .single();
  if (error || !order) throw new Error(`Commande impossible à créer : ${error?.message}`);

  const site = env.siteUrl().replace(/\/$/, '');
  const meta = { kind: 'boutique', order_id: order.id as string, user_id: params.userId };
  const session = await stripe().checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'fr',
      client_reference_id: params.userId,
      ...(params.customerId ? { customer: params.customerId } : { customer_email: params.email }),
      line_items: priced.items.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: i.unit_cents,
          product_data: {
            name: i.name,
            ...(i.detail || i.unit_cents < i.list_cents
              ? { description: [i.detail, i.unit_cents < i.list_cents ? `Prix membre Complet (au lieu de ${formatEuros(i.list_cents)})` : ''].filter(Boolean).join(' · ') }
              : {}),
            ...(i.image?.startsWith('https://') ? { images: [i.image] } : {}),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ['FR'] },
      phone_number_collection: { enabled: true },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: priced.shipping.label,
            fixed_amount: { amount: priced.shipping.cents, currency: 'eur' },
            ...(priced.shipping.minDays && priced.shipping.maxDays
              ? { delivery_estimate: { minimum: { unit: 'business_day', value: priced.shipping.minDays }, maximum: { unit: 'business_day', value: priced.shipping.maxDays } } }
              : {}),
          },
        },
      ],
      custom_text: {
        submit: { message: `En payant, vous acceptez les conditions de vente de la boutique (${site}/conditions). Articles imprimés à la demande puis expédiés.` },
      },
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Boutique Tracteurs & Co, commande ${orderReference(order.id as string)}` },
      // Une page de paiement abandonnée expire au bout d'une heure (prix et stock à revérifier ensuite).
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      success_url: `${site}/app/boutique/merci?commande=${order.id}`,
      cancel_url: `${site}/app/boutique/panier`,
    },
    { idempotencyKey: `boutique-${order.id}` },
  );
  await db.from('shop_orders').update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', order.id);
  if (!session.url) throw new Error('Stripe n’a pas renvoyé de page de paiement');
  return session.url;
}

// ---------------------------------------------------------------------
// Après paiement (webhook Stripe)
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

/** Paiement validé : on note l'adresse, puis la commande part chez Printful. */
export async function onShopCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;
  const order = await loadOrder(orderId);
  if (!order) throw new Error(`Commande boutique introuvable : ${orderId}`);
  if (session.payment_status !== 'paid') return;

  if (order.status === 'pending' || order.status === 'abandoned') {
    const ship = session.collected_information?.shipping_details;
    const addr = ship?.address;
    const recipient = addr
      ? {
          name: (ship?.name || session.customer_details?.name || '').slice(0, 120),
          address1: addr.line1 ?? '',
          address2: addr.line2 || null,
          city: addr.city ?? '',
          zip: addr.postal_code ?? '',
          country_code: addr.country ?? 'FR',
          phone: session.customer_details?.phone || null,
        }
      : null;
    await updateOrder(orderId, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      recipient,
      email: session.customer_details?.email || order.email,
      stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null),
      total_cents: session.amount_total ?? order.total_cents,
    });
    Object.assign(order, { status: 'paid', recipient });
    await notifyShop('commande_confirmee', (await loadOrder(orderId)) ?? order);
  }
  if (order.status === 'paid') await submitToPrintful(orderId);
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

/** Page de paiement expirée sans paiement. */
export async function onShopCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;
  await createServiceClient().from('shop_orders').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'pending');
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
