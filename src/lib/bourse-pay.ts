import 'server-only';
import { createHmac } from 'node:crypto';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { alertAdmins } from '@/lib/email/alerts';
import { bourseOrderEmail, type BourseOrderTemplate } from '@/lib/email/templates';
import { publicName, type Listing } from '@/lib/bourse';
import {
  HANDOVER_MAX_DAYS,
  MAX_PARCEL_KG,
  RELEASE_DAYS_AFTER_DELIVERY,
  RELEASE_DAYS_AFTER_SHIPPING,
  SECURE_PAYMENT_MAX,
  SHIP_MAX_DAYS,
  TRACKING_LABELS,
  buyerFee,
  listingPath,
  priceLabel,
  type OrderStatus,
  type ParcelPointOption,
  type ParcelSize,
  type ShippingOption,
} from '@/lib/bourse-shared';
import * as boxtal from '@/lib/boxtal';

/**
 * Bourse : paiement sécurisé (Stripe Connect, « charges et virements séparés »).
 * L'acheteur paie la plateforme ; l'argent n'est viré au vendeur qu'à la remise
 * (code donné par l'acheteur) ou à la réception du colis. Toute écriture passe
 * par ce fichier, côté serveur, et l'état du paiement est toujours relu chez Stripe.
 */

export class BourseError extends Error {}

const site = () => env.siteUrl().replace(/\/$/, '');
const DAY = 86_400_000;

// ---------------------------------------------------------------------
// Comptes vendeurs (Stripe Connect Express)
// ---------------------------------------------------------------------

export type SellerAccount = { user_id: string; stripe_account_id: string; payouts_enabled: boolean; details_submitted: boolean; requirements_due: string[] };

export async function getSellerAccount(userId: string) {
  const { data } = await createServiceClient().from('seller_accounts').select('*').eq('user_id', userId).maybeSingle();
  return (data as SellerAccount | null) ?? null;
}

/** Ouvre (ou reprend) l'inscription du vendeur chez Stripe ; renvoie l'adresse du formulaire Stripe. */
export async function sellerOnboardingUrl(userId: string, email: string) {
  let account = await getSellerAccount(userId);
  if (!account) {
    const created = await stripe().accounts.create(
      {
        type: 'express',
        country: 'FR',
        email,
        capabilities: { transfers: { requested: true } },
        business_profile: { mcc: '5999', product_description: 'Vente de matériel agricole d’occasion sur la bourse Tracteurs & Co', url: `${site()}/bourse` },
        settings: { payouts: { schedule: { interval: 'daily' } } },
        metadata: { user_id: userId },
      },
      // Clé valable 10 minutes : protège du double clic sans rejouer indéfiniment une ancienne erreur
      // (Stripe renvoie la même réponse pendant 24 h pour une même clé, même après correction du compte).
      { idempotencyKey: `vendeur-${userId}-${Math.floor(Date.now() / 600_000)}` },
    );
    const { error } = await createServiceClient().from('seller_accounts').insert({ user_id: userId, stripe_account_id: created.id });
    if (error) throw new Error(`Compte vendeur non enregistré : ${error.message}`);
    account = { user_id: userId, stripe_account_id: created.id, payouts_enabled: false, details_submitted: false, requirements_due: [] };
  }
  const link = await stripe().accountLinks.create({
    account: account.stripe_account_id,
    type: 'account_onboarding',
    refresh_url: `${site()}/app/annonces/versements?relance=1`,
    return_url: `${site()}/app/annonces/versements?retour=1`,
  });
  return link.url;
}

/** Relit l'état du compte chez Stripe (au retour du formulaire, ou à l'ouverture de la page). */
export async function refreshSellerAccount(userId: string) {
  const account = await getSellerAccount(userId);
  if (!account) return null;
  const acct = await stripe().accounts.retrieve(account.stripe_account_id);
  const patch = {
    payouts_enabled: Boolean(acct.payouts_enabled) && acct.capabilities?.transfers === 'active',
    details_submitted: Boolean(acct.details_submitted),
    requirements_due: acct.requirements?.currently_due ?? [],
    updated_at: new Date().toISOString(),
  };
  await createServiceClient().from('seller_accounts').update(patch).eq('user_id', userId);
  return { ...account, ...patch };
}

/** Tableau de bord Stripe du vendeur (virements reçus, compte bancaire). */
export async function sellerDashboardUrl(userId: string) {
  const account = await getSellerAccount(userId);
  if (!account?.details_submitted) return null;
  return (await stripe().accounts.createLoginLink(account.stripe_account_id)).url;
}

// ---------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------

export type ListingOrder = {
  id: string;
  ref: string;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  snapshot: { title: string; photo: string | null; ref: string; delivery: string };
  mode: 'envoi' | 'main_propre';
  status: OrderStatus;
  price_cents: number;
  shipping_cents: number;
  fee_cents: number;
  total_cents: number;
  stripe_payment_intent: string | null;
  stripe_charge: string | null;
  stripe_transfer: string | null;
  recipient: { name: string; address1: string; address2?: string | null; city: string; zip: string; phone?: string | null } | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  dispute_reason: string | null;
  admin_note: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  release_at: string | null;
  created_at: string;
  updated_at?: string;
  shipping_by: 'vendeur' | 'boxtal';
  shipping_offer: ShippingOption | null;
  pickup_point: ParcelPointOption | null;
  dropoff_point: ParcelPointOption | null;
  parcel: { weight_kg: number; size: ParcelSize; category: Listing['category'] } | null;
  boxtal_order_id: string | null;
  tracking_status: string | null;
  delivered_at: string | null;
};

export type Sender = { name: string; street: string; zip: string; city: string; phone: string };

/** Ce que le vendeur touche : le prix, plus le port s'il expédie lui-même (avec Boxtal, le port paie le bordereau). */
export function sellerPayout(o: Pick<ListingOrder, 'price_cents' | 'shipping_cents' | 'shipping_by'>) {
  return o.price_cents + (o.shipping_by === 'boxtal' ? 0 : o.shipping_cents);
}

async function loadOrder(id: string) {
  const { data } = await createServiceClient().from('listing_orders').select('*').eq('id', id).maybeSingle();
  return (data as ListingOrder | null) ?? null;
}

async function setOrder(id: string, patch: Partial<ListingOrder>, onlyFrom?: OrderStatus[]) {
  let q = createServiceClient().from('listing_orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (onlyFrom) q = q.in('status', onlyFrom);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`Transaction ${id} : ${error.message}`);
  return (data ?? []).length > 0;
}

async function setListingStatus(listingId: string | null, status: Listing['status'], onlyFrom: Listing['status'][]) {
  if (!listingId) return;
  await createServiceClient().from('listings').update({ status, updated_at: new Date().toISOString() }).eq('id', listingId).in('status', onlyFrom);
}

/** Code de remise en main propre (6 chiffres), calculé sans être stocké : seul l'acheteur le voit. */
export function handoverCode(orderId: string) {
  const h = createHmac('sha256', env.supabaseSecretKey()).update(`remise:${orderId}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Comment part le colis : bordereau automatique, envoi par le vendeur, ou pas d'envoi possible. */
export function shippingMode(listing: Pick<Listing, 'delivery' | 'shipping_cents' | 'weight_kg' | 'parcel_size'>): 'boxtal' | 'vendeur' | null {
  if (listing.delivery === 'main_propre') return null;
  if (listing.shipping_cents !== null) return 'vendeur';
  if (listing.parcel_size && listing.weight_kg && Number(listing.weight_kg) <= MAX_PARCEL_KG && boxtal.boxtalConfigured()) return 'boxtal';
  return null;
}

/** Offres de transport pour cette annonce jusqu'à l'adresse de l'acheteur. */
export async function shippingOptions(listing: Listing, toZip: string, toCity: string) {
  if (shippingMode(listing) !== 'boxtal') return [];
  return boxtal.quoteShipping({
    fromZip: listing.postal_code,
    fromCity: listing.city,
    toZip,
    toCity,
    weightKg: Number(listing.weight_kg),
    size: listing.parcel_size as ParcelSize,
    category: listing.category,
    valueCents: listing.price_cents,
  });
}

/** Points relais proches de l'acheteur pour une offre. */
export async function pickupPoints(offerCode: string, zip: string, city: string, street: string | null) {
  return (await boxtal.parcelPoints(offerCode, zip, city, street, 'ARRIVAL')).slice(0, 12);
}

export function quote(listing: Pick<Listing, 'price_cents' | 'shipping_cents' | 'delivery'>, mode: 'envoi' | 'main_propre', shippingCents?: number) {
  const shipping = mode === 'envoi' ? (shippingCents ?? listing.shipping_cents ?? 0) : 0;
  const fee = buyerFee(listing.price_cents);
  return { price: listing.price_cents, shipping, fee, total: listing.price_cents + shipping + fee };
}

/** L'annonce peut-elle être achetée en paiement sécurisé ? (raison sinon) */
export async function securePaymentBlocker(listing: Listing): Promise<string | null> {
  if (listing.status !== 'en_ligne') return 'Cette annonce n’est plus disponible.';
  if (listing.price_cents > SECURE_PAYMENT_MAX) return `Le paiement sécurisé est possible jusqu’à ${priceLabel(SECURE_PAYMENT_MAX)} (limite des cartes bancaires). Contactez le vendeur pour convenir du règlement.`;
  const seller = await getSellerAccount(listing.seller_id);
  if (!seller?.payouts_enabled) return 'Ce vendeur n’a pas encore activé le paiement sécurisé : contactez-le par la messagerie.';
  return null;
}

/** Crée la transaction et son paiement (réglé dans la page). */
export async function startPurchase(params: {
  buyerId: string;
  buyerEmail: string;
  customerId: string | null;
  listing: Listing;
  mode: 'envoi' | 'main_propre';
  recipient: { name: string; address1: string; address2: string | null; city: string; zip: string; phone: string } | null;
  expectedTotal: number;
  offerCode: string | null;
  pickupPointCode: string | null;
}) {
  const l = params.listing;
  if (l.seller_id === params.buyerId) throw new BourseError('C’est votre propre annonce.');
  const blocker = await securePaymentBlocker(l);
  if (blocker) throw new BourseError(blocker);
  const shipBy = shippingMode(l);
  if (params.mode === 'envoi' && !shipBy) throw new BourseError('Ce vendeur ne propose pas l’envoi pour cette annonce.');
  if (params.mode === 'main_propre' && l.delivery === 'envoi') throw new BourseError('Ce vendeur propose uniquement l’envoi.');
  if (params.mode === 'envoi' && !params.recipient) throw new BourseError('Indiquez l’adresse de livraison.');

  // Envoi automatique : l'offre et le point relais sont revérifiés auprès de Boxtal.
  let offer: ShippingOption | null = null;
  let pickup: ParcelPointOption | null = null;
  if (params.mode === 'envoi' && shipBy === 'boxtal') {
    const r = params.recipient!;
    let offers: ShippingOption[];
    try {
      offers = await shippingOptions(l, r.zip, r.city);
    } catch (err) {
      console.error('[bourse] cotation', err);
      throw new BourseError('Le calcul des frais de port est momentanément indisponible. Réessayez dans un instant.');
    }
    offer = offers.find((o) => o.code === params.offerCode) ?? null;
    if (!offer) throw new BourseError('Choisissez un mode de livraison.');
    if (offer.delivery === 'PICKUP_POINT') {
      if (!params.pickupPointCode) throw new BourseError('Choisissez votre point relais.');
      const points = await boxtal.parcelPoints(offer.code, r.zip, r.city, r.address1, 'ARRIVAL').catch(() => []);
      pickup = points.find((p) => p.code === params.pickupPointCode) ?? null;
      if (!pickup) throw new BourseError('Ce point relais n’est plus disponible : choisissez-en un autre.');
    }
  }
  const q = quote(l, params.mode, offer?.price_cents);
  if (q.total !== params.expectedTotal) throw new BourseError('Le prix a changé entre-temps : vérifiez le nouveau montant puis payez à nouveau.');

  const db = createServiceClient();
  const { data: order, error } = await db
    .from('listing_orders')
    .insert({
      listing_id: l.id,
      buyer_id: params.buyerId,
      seller_id: l.seller_id,
      snapshot: { title: l.title, photo: l.photos[0]?.url ?? null, ref: l.ref, delivery: l.delivery },
      mode: params.mode,
      price_cents: q.price,
      shipping_cents: q.shipping,
      fee_cents: q.fee,
      total_cents: q.total,
      shipping_by: params.mode === 'envoi' && shipBy === 'boxtal' ? 'boxtal' : 'vendeur',
      shipping_offer: offer,
      pickup_point: pickup,
      parcel: params.mode === 'envoi' && shipBy === 'boxtal' ? { weight_kg: Number(l.weight_kg), size: l.parcel_size, category: l.category } : null,
      // Adresse vérifiée ici (c'est elle qui a servi au calcul du port) : elle fait foi, pas celle du paiement.
      recipient: params.mode === 'envoi' ? params.recipient : null,
    })
    .select('id, ref')
    .single();
  if (error || !order) throw new Error(`Transaction non créée : ${error?.message}`);
  // Pas d'adresse sur le paiement : le formulaire Stripe (champ adresse) l'y ajoute lui-même à la confirmation,
  // et Stripe refuse qu'elle soit d'abord posée côté serveur puis modifiée côté navigateur.
  const intent = await stripe().paymentIntents.create(
    {
      amount: q.total,
      currency: 'eur',
      allowed_payment_method_types: ['card', 'paypal'],
      ...(params.customerId ? { customer: params.customerId } : {}),
      description: `Bourse Tracteurs & Co, achat ${order.ref} : ${l.title}`.slice(0, 900),
      statement_descriptor_suffix: 'BOURSE',
      transfer_group: `bourse-${order.id}`,
      metadata: { kind: 'bourse', order_id: order.id as string, listing_id: l.id, buyer_id: params.buyerId, seller_id: l.seller_id },
    },
    { idempotencyKey: `bourse-${order.id}` },
  );
  await db.from('listing_orders').update({ stripe_payment_intent: intent.id }).eq('id', order.id);
  if (!intent.client_secret) throw new Error('Stripe n’a pas renvoyé de paiement');
  return { orderId: order.id as string, clientSecret: intent.client_secret };
}

/** Paiement reçu : la transaction passe « payée », l'annonce est réservée, chacun est prévenu. */
export async function settleBoursePayment(intentOrId: Stripe.PaymentIntent | string) {
  const intent = typeof intentOrId === 'string' ? await stripe().paymentIntents.retrieve(intentOrId) : intentOrId;
  const orderId = intent.metadata?.kind === 'bourse' ? intent.metadata.order_id : null;
  if (!orderId) return null;
  const order = await loadOrder(orderId);
  if (!order) throw new Error(`Transaction introuvable : ${orderId}`);
  if (intent.status !== 'succeeded' || order.stripe_payment_intent !== intent.id || intent.amount_received < order.total_cents) return order;
  if (order.status !== 'pending' && order.status !== 'abandoned') return order;

  const s = intent.shipping;
  const recipient =
    order.recipient ??
    (order.mode === 'envoi' && s?.address
      ? { name: s.name ?? '', address1: s.address.line1 ?? '', address2: s.address.line2 ?? null, city: s.address.city ?? '', zip: s.address.postal_code ?? '', phone: s.phone ?? null }
      : null);
  const charge = typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null);
  try {
    const claimed = await setOrder(
      orderId,
      { status: 'paid', paid_at: new Date().toISOString(), stripe_charge: charge, recipient, release_at: new Date(Date.now() + (order.mode === 'main_propre' ? HANDOVER_MAX_DAYS : SHIP_MAX_DAYS) * DAY).toISOString() },
      ['pending', 'abandoned'],
    );
    if (!claimed) return loadOrder(orderId);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('listing_orders_active_idx'))) throw err;
    // Deux acheteurs ont payé la même annonce au même moment : le second est remboursé tout de suite.
    console.warn('[bourse] annonce déjà payée par un autre acheteur', orderId, err);
    await stripe().refunds.create({ payment_intent: intent.id, reason: 'duplicate' }, { idempotencyKey: `bourse-doublon-${orderId}` });
    await setOrder(orderId, { status: 'refunded', canceled_at: new Date().toISOString(), admin_note: 'Annonce payée au même moment par un autre acheteur : remboursé automatiquement.' });
    await notify('annulee_acheteur', (await loadOrder(orderId))!, 'buyer', 'L’annonce venait d’être achetée par un autre membre : vous êtes intégralement remboursé.');
    return loadOrder(orderId);
  }
  await setListingStatus(order.listing_id, 'reservee', ['en_ligne', 'reservee']);
  const fresh = (await loadOrder(orderId))!;
  await notify('achat_confirme', fresh, 'buyer');
  await notify('vente_conclue', fresh, 'seller');
  return fresh;
}

/** Fonds versés au vendeur : la vente est terminée. */
async function complete(order: ListingOrder, why: string) {
  if (!order.seller_id) throw new Error('Vendeur introuvable');
  const seller = await getSellerAccount(order.seller_id);
  if (!seller) throw new BourseError('Le compte de versement du vendeur est introuvable.');
  // Le virement passe d'abord (idempotent) ; la transaction n'est close qu'ensuite.
  const transfer = await stripe().transfers.create(
    {
      amount: sellerPayout(order),
      currency: 'eur',
      destination: seller.stripe_account_id,
      transfer_group: `bourse-${order.id}`,
      ...(order.stripe_charge ? { source_transaction: order.stripe_charge } : {}),
      description: `Vente ${order.ref} : ${order.snapshot.title}`.slice(0, 500),
      metadata: { order_id: order.id, motif: why },
    },
    { idempotencyKey: `bourse-virement-${order.id}` },
  );
  const done = await setOrder(order.id, { status: 'completed', completed_at: new Date().toISOString(), stripe_transfer: transfer.id, release_at: null }, ['paid', 'shipped', 'disputed']);
  if (!done) return;
  await setListingStatus(order.listing_id, 'vendue', ['en_ligne', 'reservee']);
  const fresh = (await loadOrder(order.id))!;
  await notify('terminee_vendeur', fresh, 'seller');
  await notify('terminee_acheteur', fresh, 'buyer');
}

/** Remboursement intégral de l'acheteur (frais de service compris) ; l'annonce est remise en vente. */
async function refund(order: ListingOrder, note: string, by: 'seller' | 'buyer' | 'admin' | 'auto') {
  if (!order.stripe_payment_intent) throw new Error('Paiement introuvable');
  // Bordereau pas encore déposé : annulé chez Boxtal (remboursé sur la facture suivante).
  if (order.boxtal_order_id && !order.shipped_at) {
    await boxtal.cancelShipment(order.boxtal_order_id).catch((err) => console.error('[bourse] annulation du bordereau', order.id, err));
  }
  await stripe().refunds.create({ payment_intent: order.stripe_payment_intent, reason: 'requested_by_customer', metadata: { order_id: order.id, par: by } }, { idempotencyKey: `bourse-remb-${order.id}` });
  const done = await setOrder(order.id, { status: 'refunded', canceled_at: new Date().toISOString(), admin_note: note, release_at: null }, ['paid', 'shipped', 'disputed']);
  if (!done) return;
  await setListingStatus(order.listing_id, 'en_ligne', ['reservee']);
  const fresh = (await loadOrder(order.id))!;
  await notify('annulee_acheteur', fresh, 'buyer', note);
  await notify('annulee_vendeur', fresh, 'seller', note);
}

// --- Actions des deux parties (droits vérifiés ici, pas seulement dans la page) ---

export async function confirmHandover(orderId: string, sellerId: string, code: string) {
  const o = await loadOrder(orderId);
  if (!o || o.seller_id !== sellerId || o.mode !== 'main_propre' || o.status !== 'paid') throw new BourseError('Transaction introuvable.');
  if (code.replace(/\s/g, '') !== handoverCode(o.id)) throw new BourseError('Code incorrect : demandez à l’acheteur le code à 6 chiffres affiché sur son téléphone.');
  await complete(o, 'remise en main propre');
}

export async function markShipped(orderId: string, sellerId: string, carrier: string, tracking: string) {
  const o = await loadOrder(orderId);
  if (!o || o.seller_id !== sellerId || o.mode !== 'envoi' || o.status !== 'paid') throw new BourseError('Transaction introuvable.');
  if (o.shipping_by === 'boxtal') throw new BourseError('Le suivi de ce colis se met à jour automatiquement.');
  await setOrder(o.id, { status: 'shipped', shipped_at: new Date().toISOString(), carrier, tracking_number: tracking, release_at: new Date(Date.now() + RELEASE_DAYS_AFTER_SHIPPING * DAY).toISOString() }, ['paid']);
  await notify('expediee', (await loadOrder(o.id))!, 'buyer');
}

export async function confirmReceipt(orderId: string, buyerId: string) {
  const o = await loadOrder(orderId);
  if (!o || o.buyer_id !== buyerId || !['shipped', 'paid'].includes(o.status) || o.mode !== 'envoi') throw new BourseError('Transaction introuvable.');
  await complete(o, 'réception confirmée par l’acheteur');
}

export async function sellerCancel(orderId: string, sellerId: string, reason: string) {
  const o = await loadOrder(orderId);
  if (!o || o.seller_id !== sellerId || o.status !== 'paid') throw new BourseError('Cette vente ne peut plus être annulée : contactez-nous.');
  await refund(o, `Vente annulée par le vendeur${reason ? ` : ${reason}` : ''}. Vous êtes intégralement remboursé.`, 'seller');
}

export async function openDispute(orderId: string, buyerId: string, reason: string) {
  const o = await loadOrder(orderId);
  if (!o || o.buyer_id !== buyerId || !['paid', 'shipped'].includes(o.status)) throw new BourseError('Transaction introuvable.');
  await setOrder(o.id, { status: 'disputed', dispute_reason: reason.slice(0, 1000), release_at: null }, ['paid', 'shipped']);
  const fresh = (await loadOrder(o.id))!;
  await notify('litige', fresh, 'seller', reason);
  await alertAdmins(`bourse_litige_${o.ref}`, `Litige sur la vente ${o.ref}`, [`${o.snapshot.title} · ${priceLabel(o.total_cents)}`, `Motif de l’acheteur : ${reason}`, 'L’argent est bloqué : tranchez depuis l’admin (rembourser l’acheteur ou payer le vendeur).'], `${site()}/admin/bourse`);
}

export async function adminResolve(orderId: string, decision: 'rembourser' | 'payer', note: string) {
  const o = await loadOrder(orderId);
  if (!o || !['paid', 'shipped', 'disputed'].includes(o.status)) throw new BourseError('Transaction introuvable ou déjà close.');
  if (decision === 'payer') await complete(o, `décision de l’équipe${note ? ` : ${note}` : ''}`);
  else await refund(o, `Remboursement décidé par l’équipe Tracteurs & Co${note ? ` : ${note}` : ''}.`, 'admin');
}

/** Remboursement fait directement dans Stripe. */
export async function onBourseRefund(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return;
  const { data } = await createServiceClient().from('listing_orders').select('*').eq('stripe_payment_intent', pi).maybeSingle();
  const o = data as ListingOrder | null;
  if (!o || ['refunded', 'completed', 'canceled'].includes(o.status)) return;
  await setOrder(o.id, { status: 'refunded', canceled_at: new Date().toISOString(), release_at: null });
  await setListingStatus(o.listing_id, 'en_ligne', ['reservee']);
}

/** Tâche quotidienne : versements automatiques, remises jamais faites, paiements abandonnés. */
export async function runBourseAutomation() {
  const db = createServiceClient();
  const now = new Date().toISOString();
  let released = 0;
  let canceled = 0;
  const { data: due } = await db.from('listing_orders').select('*').in('status', ['shipped', 'paid']).lt('release_at', now).limit(100);
  for (const o of (due ?? []) as ListingOrder[]) {
    try {
      if (o.status === 'shipped') {
        await complete(o, `aucune réclamation ${RELEASE_DAYS_AFTER_SHIPPING} jours après l’expédition`);
        released++;
      } else {
        // Dernier coup d'œil au suivi : un colis déposé entre-temps n'est pas annulé.
        if (o.boxtal_order_id) {
          const fresh = await syncShipment(o).catch(() => o);
          if (fresh.status !== 'paid') continue;
        }
        await refund(
          o,
          o.mode === 'main_propre'
            ? `La remise n’a pas eu lieu dans les ${HANDOVER_MAX_DAYS} jours : la vente est annulée et vous êtes intégralement remboursé.`
            : `Le colis n’a pas été expédié dans les ${SHIP_MAX_DAYS} jours : la vente est annulée et vous êtes intégralement remboursé.`,
          'auto',
        );
        canceled++;
      }
    } catch (err) {
      console.error('[bourse] automatique', o.id, err);
    }
  }
  // Paiements commencés mais jamais réglés.
  const { data: stale } = await db.from('listing_orders').select('id, stripe_payment_intent').eq('status', 'pending').lt('created_at', new Date(Date.now() - DAY).toISOString()).limit(100);
  for (const o of stale ?? []) {
    try {
      if (o.stripe_payment_intent) {
        const pi = await stripe().paymentIntents.retrieve(o.stripe_payment_intent as string);
        if (pi.status === 'succeeded') {
          await settleBoursePayment(pi);
          continue;
        }
        if (!['canceled', 'processing'].includes(pi.status)) await stripe().paymentIntents.cancel(pi.id);
      }
      await setOrder(o.id as string, { status: 'abandoned' }, ['pending']);
    } catch (err) {
      console.error('[bourse] paiement abandonné', o.id, err);
    }
  }
  // Colis Boxtal en route : suivi relu (filet de sécurité si une notification s'est perdue).
  let synced = 0;
  const { data: moving } = await db.from('listing_orders').select('*').eq('shipping_by', 'boxtal').in('status', ['paid', 'shipped']).not('boxtal_order_id', 'is', null).is('delivered_at', null).limit(200);
  for (const o of (moving ?? []) as ListingOrder[]) {
    try {
      await syncShipment(o);
      synced++;
    } catch (err) {
      console.error('[bourse] suivi', o.id, err);
    }
  }
  return { released, canceled, synced };
}

// ---------------------------------------------------------------------
// Envoi automatique (Boxtal)
// ---------------------------------------------------------------------

/** Le vendeur génère son bordereau : l'expédition est commandée chez Boxtal, aux frais de la plateforme (payés par l'acheteur). */
export async function createLabel(orderId: string, sellerId: string, sender: Sender) {
  const o = await loadOrder(orderId);
  if (!o || o.seller_id !== sellerId || o.shipping_by !== 'boxtal' || o.status !== 'paid') throw new BourseError('Transaction introuvable.');
  if (o.boxtal_order_id) return o;
  if (!o.shipping_offer || !o.parcel || !o.recipient) throw new BourseError('Informations d’envoi incomplètes : contactez-nous.');
  const db = createServiceClient();
  const [{ data: seller }, { data: buyer }] = await Promise.all([
    db.from('profiles').select('email, full_name').eq('id', sellerId).maybeSingle(),
    db.from('profiles').select('email').eq('id', o.buyer_id ?? '').maybeSingle(),
  ]);
  await db.from('seller_accounts').update({ sender, updated_at: new Date().toISOString() }).eq('user_id', sellerId);

  const r = o.recipient;
  const request: boxtal.ShipmentRequest = {
    offerCode: o.shipping_offer.code,
    from: { ...boxtal.splitName(sender.name), email: seller?.email ?? '', phone: sender.phone, street: sender.street, zip: sender.zip, city: sender.city },
    to: { ...boxtal.splitName(r.name), email: buyer?.email ?? '', phone: r.phone ?? '', street: [r.address1, r.address2].filter(Boolean).join(', '), zip: r.zip, city: r.city },
    weightKg: o.parcel.weight_kg,
    size: o.parcel.size,
    category: o.parcel.category,
    valueCents: o.price_cents,
    description: `${o.snapshot.title} (matériel agricole d’occasion)`,
    pickupPointCode: o.pickup_point?.code ?? null,
    dropoffPointCode: null,
    externalId: o.id,
  };
  // Point de dépôt du vendeur : le plus proche de son adresse (certains transporteurs l'exigent).
  let dropoff: ParcelPointOption | null = null;
  if (o.shipping_offer.collection === 'DROPOFF_POINT') {
    dropoff = (await boxtal.parcelPoints(o.shipping_offer.code, sender.zip, sender.city, sender.street, 'DEPARTURE').catch(() => []))[0] ?? null;
  }
  let created: boxtal.ShipmentCreated;
  try {
    created = await boxtal.createShipment(request);
  } catch (err) {
    if (dropoff && err instanceof boxtal.BoxtalError && err.fields.some((f) => /dropoff/i.test(f))) {
      created = await boxtal.createShipment({ ...request, dropoffPointCode: dropoff.code });
    } else {
      console.error('[bourse] bordereau', o.id, err);
      throw new BourseError(
        err instanceof boxtal.BoxtalError && err.status === 422
          ? `Le transporteur refuse ces informations : ${err.message.replace(/^.*?: /, '')}. Vérifiez votre adresse et votre téléphone.`
          : 'Le bordereau n’a pas pu être créé pour le moment. Réessayez dans quelques minutes.',
      );
    }
  }
  await setOrder(o.id, { boxtal_order_id: created.id, dropoff_point: dropoff, tracking_status: 'ANNOUNCED' }, ['paid']);
  return (await loadOrder(o.id))!;
}

/** Lien du bordereau PDF (temporaire, redemandé à chaque clic). */
export async function labelLink(orderId: string, sellerId: string) {
  const o = await loadOrder(orderId);
  if (!o || o.seller_id !== sellerId || !o.boxtal_order_id) return null;
  return boxtal.labelUrl(o.boxtal_order_id);
}

/** Relit le suivi Boxtal et fait avancer la transaction (déposé → expédié, livré → versement sous 2 jours). */
export async function syncShipment(order: ListingOrder): Promise<ListingOrder> {
  if (!order.boxtal_order_id || !['paid', 'shipped'].includes(order.status)) return order;
  const t = await boxtal.tracking(order.boxtal_order_id);
  if (!t) return order;
  const patch: Partial<ListingOrder> = { tracking_status: t.status };
  if (t.number) patch.tracking_number = t.number;
  if (t.url) patch.tracking_url = t.url;
  if (!order.carrier && order.shipping_offer) patch.carrier = order.shipping_offer.carrier;
  let shippedNow = false;
  if (order.status === 'paid' && t.handedOver) {
    Object.assign(patch, { status: 'shipped', shipped_at: new Date().toISOString(), release_at: new Date(Date.now() + RELEASE_DAYS_AFTER_SHIPPING * DAY).toISOString() });
    shippedNow = true;
  }
  let deliveredNow = false;
  if (t.delivered && !order.delivered_at) {
    const at = new Date();
    Object.assign(patch, { delivered_at: at.toISOString(), release_at: new Date(at.getTime() + RELEASE_DAYS_AFTER_DELIVERY * DAY).toISOString() });
    deliveredNow = true;
  }
  if (patch.tracking_status === order.tracking_status && !shippedNow && !deliveredNow && (patch.tracking_number ?? order.tracking_number) === order.tracking_number) return order;
  await setOrder(order.id, patch, ['paid', 'shipped']);
  const fresh = (await loadOrder(order.id))!;
  if (shippedNow) await notify('expediee', fresh, 'buyer');
  if (deliveredNow) await notify('livree', fresh, 'buyer');
  return fresh;
}

/** Notification Boxtal (signature vérifiée par la route). */
export async function onBoxtalEvent(shippingOrderId: string, externalId: string | null) {
  const db = createServiceClient();
  let q = db.from('listing_orders').select('*');
  q = externalId && /^[0-9a-f-]{36}$/i.test(externalId) ? q.eq('id', externalId) : q.eq('boxtal_order_id', shippingOrderId);
  const { data } = await q.maybeSingle();
  const o = data as ListingOrder | null;
  if (!o || o.boxtal_order_id !== shippingOrderId) return;
  await syncShipment(o);
}

export const trackingLabel = (status: string | null) => (status ? (TRACKING_LABELS[status] ?? status) : null);

// ---------------------------------------------------------------------
// E-mails
// ---------------------------------------------------------------------

async function notify(template: BourseOrderTemplate, o: ListingOrder, to: 'buyer' | 'seller', note?: string) {
  const userId = to === 'buyer' ? o.buyer_id : o.seller_id;
  if (!userId) return;
  try {
    const db = createServiceClient();
    const [{ data: me }, { data: other }] = await Promise.all([
      db.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle(),
      db.from('profiles').select('full_name').eq('id', (to === 'buyer' ? o.seller_id : o.buyer_id) ?? '').maybeSingle(),
    ]);
    if (!me?.email) return;
    await sendEmail(
      {
        to: me.email,
        email: bourseOrderEmail(
          template,
          {
            name: me.full_name,
            other: publicName(other?.full_name),
            ref: o.ref,
            title: o.snapshot.title,
            total: priceLabel(o.total_cents),
            payout: priceLabel(sellerPayout(o)),
            boxtal: o.shipping_by === 'boxtal',
            pickup: o.pickup_point ? `${o.pickup_point.name}, ${o.pickup_point.street}, ${o.pickup_point.zip} ${o.pickup_point.city}` : null,
            mode: o.mode,
            url: `${site()}/app/transactions/${o.id}`,
            listingUrl: o.snapshot.ref ? `${site()}${listingPath({ ref: o.snapshot.ref, title: o.snapshot.title })}` : null,
            tracking: o.tracking_number ? `${o.carrier ?? 'Transporteur'} · ${o.tracking_number}` : null,
            note: note ?? null,
          },
          env.siteUrl(),
        ),
        kind: 'facturation',
        template: `bourse_${template}`,
        userId: me.id,
      },
      { idempotencyKey: `bourse-${o.id}-${template}-${to}` },
    );
  } catch (err) {
    console.error('[bourse] e-mail', template, err);
  }
}
