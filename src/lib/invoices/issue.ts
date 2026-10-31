import 'server-only';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { getBillingDetails } from '@/lib/billing-details';
import { frenchDate, type InvoiceCustomer, type InvoiceLine, type InvoiceRow } from './types';

/**
 * Émission des factures et avoirs Tracteurs & Co, à partir des événements
 * Stripe (webhook). Stripe encaisse ; c'est le site qui facture.
 * Idempotent : un même paiement ou remboursement ne donne qu'un document.
 */

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null);

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', cartes_bancaires: 'CB', unionpay: 'UnionPay', discover: 'Discover', jcb: 'JCB' };

/** « carte Visa •••• 4242 » d'après la charge Stripe. */
export function paymentMethodLabel(charge: Stripe.Charge | null | undefined) {
  const d = charge?.payment_method_details;
  if (!d) return 'carte bancaire';
  if (d.card) return `carte ${BRANDS[d.card.brand ?? ''] ?? d.card.brand ?? 'bancaire'} •••• ${d.card.last4}`;
  if (d.sepa_debit) return `prélèvement SEPA •••• ${d.sepa_debit.last4}`;
  if (d.link) return 'Link';
  return d.type.replace(/_/g, ' ');
}

async function chargeForInvoice(invoiceId: string) {
  try {
    const list = await stripe().invoicePayments.list({ invoice: invoiceId, limit: 3, expand: ['data.payment.payment_intent.latest_charge'] });
    const paid = list.data.find((p) => p.status === 'paid') ?? list.data[0];
    const pi = paid?.payment?.payment_intent;
    if (pi && typeof pi !== 'string') {
      const ch = pi.latest_charge;
      if (ch && typeof ch !== 'string') return ch;
      if (typeof ch === 'string') return await stripe().charges.retrieve(ch);
    }
    const ch = paid?.payment?.charge;
    if (typeof ch === 'string') return await stripe().charges.retrieve(ch);
    return ch ?? null;
  } catch (err) {
    console.warn('[factures] moyen de paiement introuvable', invoiceId, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Copie de l'acheteur : informations de facturation du site, sinon celles du client Stripe, sinon le profil. */
async function customerSnapshot(userId: string | null, stripeCustomerId: string | null): Promise<InvoiceCustomer> {
  const db = createServiceClient();
  const profile = userId ? (await db.from('profiles').select('email, full_name, farm_name').eq('id', userId).maybeSingle()).data : null;
  const details = userId ? await getBillingDetails(userId) : null;
  let sc: Stripe.Customer | null = null;
  if (!details && stripeCustomerId) {
    const c = await stripe().customers.retrieve(stripeCustomerId).catch(() => null);
    if (c && !('deleted' in c && c.deleted)) sc = c as Stripe.Customer;
  }
  return {
    name: details?.name || sc?.name || profile?.farm_name || profile?.full_name || '',
    email: profile?.email || sc?.email || '',
    line1: details?.line1 ?? sc?.address?.line1 ?? '',
    line2: details?.line2 ?? sc?.address?.line2 ?? '',
    postal_code: details?.postal_code ?? sc?.address?.postal_code ?? '',
    city: details?.city ?? sc?.address?.city ?? '',
    country: details?.country ?? sc?.address?.country ?? 'FR',
    siret: details?.siret ?? '',
    vat_number: details?.vat_number ?? '',
  };
}

function periodLabel(start: number, end: number) {
  return `Période du ${frenchDate(start)} au ${frenchDate(end)}`;
}

/** Lignes de la facture : abonnement, ajustements au prorata, remises, crédit appliqué. */
export function invoiceLines(inv: Stripe.Invoice): InvoiceLine[] {
  const monthly = env.stripePriceComplet();
  const lines: InvoiceLine[] = [];
  for (const l of inv.lines.data) {
    const price = l.pricing?.price_details?.price;
    const priceId = typeof price === 'string' ? price : price?.id;
    const proration = Boolean(l.parent?.subscription_item_details?.proration || l.parent?.invoice_item_details?.proration);
    const formula = priceId === monthly ? 'mensuel' : priceId && priceId === env.stripePriceCompletAnnuel() ? 'annuel' : null;
    const quantity = l.quantity ?? 1;
    const label = proration
      ? l.amount < 0
        ? 'Ajustement : temps non utilisé sur la formule précédente'
        : `Ajustement au prorata : formule Complet${formula ? ` (${formula})` : ''}`
      : `Abonnement Tracteurs & Co – formule Complet${formula ? ` (${formula})` : ''}`;
    lines.push({
      label,
      detail: l.period?.start && l.period?.end ? periodLabel(l.period.start, l.period.end) : undefined,
      quantity,
      unit_cents: quantity ? Math.round(l.amount / quantity) : l.amount,
      total_cents: l.amount,
    });
  }
  const discount = (inv.total_discount_amounts ?? []).reduce((s, d) => s + d.amount, 0);
  if (discount > 0) lines.push({ label: 'Remise (code promotionnel)', quantity: 1, unit_cents: -discount, total_cents: -discount });
  // Écart restant (crédit du compte client appliqué, arrondis) : ligne explicite pour que le total soit juste.
  const sum = lines.reduce((s, l) => s + l.total_cents, 0);
  const gap = inv.amount_paid - sum;
  if (gap !== 0) lines.push({ label: gap < 0 ? 'Crédit déduit (avoir ou solde du compte)' : 'Solde antérieur', quantity: 1, unit_cents: gap, total_cents: gap });
  return lines;
}

/** Facture pour un paiement Stripe encaissé (événement invoice.paid). Rien pour un essai à 0 €. */
export async function issueInvoiceForStripeInvoice(inv: Stripe.Invoice): Promise<InvoiceRow | null> {
  if (!inv.id || inv.amount_paid <= 0) return null;
  const db = createServiceClient();
  const { data: existing } = await db.from('invoices').select('*').eq('stripe_invoice_id', inv.id).maybeSingle();
  if (existing) return existing as InvoiceRow;

  const stripeCustomerId = idOf(inv.customer);
  const { data: owner } = stripeCustomerId
    ? await db.from('profiles').select('id').eq('stripe_customer_id', stripeCustomerId).maybeSingle()
    : { data: null };
  const userId = (owner?.id as string | undefined) ?? null;
  const charge = await chargeForInvoice(inv.id);
  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString();

  const { data, error } = await db.rpc('issue_invoice', {
    p: {
      kind: 'facture',
      user_id: userId,
      stripe_invoice_id: inv.id,
      paid_at: paidAt,
      customer: await customerSnapshot(userId, stripeCustomerId),
      lines: invoiceLines(inv),
      total_cents: inv.amount_paid,
      currency: inv.currency,
      payment_method: paymentMethodLabel(charge),
    },
  });
  if (error) throw new Error(`Émission de la facture impossible : ${error.message}`);
  return data as InvoiceRow;
}

/** Facture Stripe d'origine d'un remboursement (métadonnée posée par l'admin, sinon via le paiement). */
async function stripeInvoiceOfRefund(refund: Stripe.Refund, charge: Stripe.Charge) {
  if (refund.metadata?.facture) return refund.metadata.facture;
  const pi = idOf(charge.payment_intent);
  if (!pi) return null;
  const list = await stripe().invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 });
  return idOf(list.data[0]?.invoice) ?? null;
}

/** Avoirs pour les remboursements d'une charge (événement charge.refunded, total ou partiel). */
export async function issueCreditNotesForCharge(charge: Stripe.Charge): Promise<{ invoice: InvoiceRow; credited: InvoiceRow }[]> {
  const db = createServiceClient();
  const refunds = await stripe().refunds.list({ charge: charge.id, limit: 20 });
  const issued: { invoice: InvoiceRow; credited: InvoiceRow }[] = [];
  for (const r of refunds.data) {
    if (!['succeeded', 'pending'].includes(r.status ?? '')) continue;
    const { data: already } = await db.from('invoices').select('id').eq('stripe_refund_id', r.id).maybeSingle();
    if (already) continue;
    const stripeInvoiceId = await stripeInvoiceOfRefund(r, charge);
    if (!stripeInvoiceId) continue;
    const { data: original } = await db.from('invoices').select('*').eq('stripe_invoice_id', stripeInvoiceId).maybeSingle();
    // Paiement antérieur aux factures du site : rien à annuler de notre côté.
    if (!original) continue;
    const orig = original as InvoiceRow;
    const { data, error } = await db.rpc('issue_invoice', {
      p: {
        kind: 'avoir',
        user_id: orig.user_id,
        stripe_refund_id: r.id,
        credited_invoice_id: orig.id,
        paid_at: new Date(r.created * 1000).toISOString(),
        customer: orig.customer,
        lines: [
          {
            label: `Remboursement${r.amount < orig.total_cents ? ' partiel' : ''} de la facture ${orig.number}`,
            detail: orig.lines[0]?.label,
            quantity: 1,
            unit_cents: r.amount,
            total_cents: r.amount,
          },
        ],
        total_cents: r.amount,
        currency: r.currency,
        payment_method: `sur la ${paymentMethodLabel(charge)}`,
      },
    });
    if (error) throw new Error(`Émission de l’avoir impossible : ${error.message}`);
    issued.push({ invoice: data as InvoiceRow, credited: orig });
  }
  return issued;
}
