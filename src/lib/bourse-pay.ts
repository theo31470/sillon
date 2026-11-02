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
  RELEASE_DAYS_AFTER_SHIPPING,
  SECURE_PAYMENT_MAX,
  buyerFee,
  listingPath,
  priceLabel,
  type OrderStatus,
} from '@/lib/bourse-shared';

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
      { idempotencyKey: `vendeur-${userId}` },
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
};

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

export function quote(listing: Pick<Listing, 'price_cents' | 'shipping_cents' | 'delivery'>, mode: 'envoi' | 'main_propre') {
  const shipping = mode === 'envoi' ? (listing.shipping_cents ?? 0) : 0;
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
}) {
  const l = params.listing;
  if (l.seller_id === params.buyerId) throw new BourseError('C’est votre propre annonce.');
  const blocker = await securePaymentBlocker(l);
  if (blocker) throw new BourseError(blocker);
  if (params.mode === 'envoi' && (l.delivery === 'main_propre' || l.shipping_cents === null)) throw new BourseError('Ce vendeur ne propose pas l’envoi pour cette annonce.');
  if (params.mode === 'main_propre' && l.delivery === 'envoi') throw new BourseError('Ce vendeur propose uniquement l’envoi.');
  if (params.mode === 'envoi' && !params.recipient) throw new BourseError('Indiquez l’adresse de livraison.');
  const q = quote(l, params.mode);
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
    })
    .select('id, ref')
    .single();
  if (error || !order) throw new Error(`Transaction non créée : ${error?.message}`);
  const r = params.recipient;
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
      ...(r
        ? { shipping: { name: r.name, phone: r.phone, address: { line1: r.address1, line2: r.address2 ?? undefined, city: r.city, postal_code: r.zip, country: 'FR' } } }
        : {}),
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
    order.mode === 'envoi' && s?.address
      ? { name: s.name ?? '', address1: s.address.line1 ?? '', address2: s.address.line2 ?? null, city: s.address.city ?? '', zip: s.address.postal_code ?? '', phone: s.phone ?? null }
      : null;
  const charge = typeof intent.latest_charge === 'string' ? intent.latest_charge : (intent.latest_charge?.id ?? null);
  try {
    const claimed = await setOrder(
      orderId,
      { status: 'paid', paid_at: new Date().toISOString(), stripe_charge: charge, recipient, release_at: order.mode === 'main_propre' ? new Date(Date.now() + HANDOVER_MAX_DAYS * DAY).toISOString() : null },
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
      amount: order.price_cents + order.shipping_cents,
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
      } else if (o.mode === 'main_propre') {
        await refund(o, `La remise n’a pas eu lieu dans les ${HANDOVER_MAX_DAYS} jours : la vente est annulée et vous êtes intégralement remboursé.`, 'auto');
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
  return { released, canceled };
}

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
            payout: priceLabel(o.price_cents + o.shipping_cents),
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
