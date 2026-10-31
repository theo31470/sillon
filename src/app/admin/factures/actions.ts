'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type Stripe from 'stripe';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/admin';
import { billingFromForm, saveBillingDetails } from '@/lib/billing-details';
import { euros, notifyBilling } from '@/lib/email/billing';
import { invoiceAttachment, onChargeRefunded } from '@/lib/invoices/notify';
import { applyPeriodChange } from '@/lib/subscription-ops';
import { currentStripeSubscription } from '@/lib/subscription-view';
import type { InvoiceRow } from '@/lib/invoices/types';
import type { FormState } from '@/components/form-bits';

/**
 * Actions d'administration de la facturation : formule d'un membre, remboursements
 * (avoirs), renvoi de factures, informations de facturation, codes promotionnels.
 * Toutes exigent un admin en double authentification ; les opérations sur l'argent
 * exigent un code récent. Chacune est inscrite au journal d'activité.
 */

const RECENT_MFA = 'Action sensible : validez à nouveau votre code de double authentification (lien en haut de la page), puis recommencez.';

function stripeError(err: unknown) {
  const e = err as { type?: string; message?: string; statusCode?: number };
  console.error('[admin facturation]', e?.message ?? err);
  if (e?.statusCode === 403 || /permission|restricted/i.test(e?.message ?? '')) {
    return 'La clé Stripe du site n’a pas le droit de faire cette opération (Stripe → Développeurs → Clés API).';
  }
  if (err instanceof Error && !e?.type) return err.message;
  return `Stripe a refusé l’opération : ${e?.message ?? 'erreur inconnue'}`.slice(0, 300);
}

async function memberOf(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('user_id'));
  if (!id.success) return null;
  const { data } = await createServiceClient().from('profiles').select('id, email, stripe_customer_id').eq('id', id.data).maybeSingle();
  return data as { id: string; email: string; stripe_customer_id: string | null } | null;
}

function refresh(userId?: string | null) {
  revalidatePath('/admin/factures');
  revalidatePath('/admin/paiements');
  if (userId) revalidatePath(`/admin/membres/${userId}`);
}

async function loadInvoice(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('invoice_id'));
  if (!id.success) return null;
  const { data } = await createServiceClient().from('invoices').select('*').eq('id', id.data).maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

// ---------------------------------------------------------------------
// Formule d'un membre
// ---------------------------------------------------------------------

export async function adminChangePeriod(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const member = await memberOf(formData);
  if (!member?.stripe_customer_id) return { error: 'Ce membre n’a pas d’abonnement Stripe.' };
  const target = formData.get('periode') === 'annuel' ? 'annuel' : 'mensuel';
  try {
    const sub = await currentStripeSubscription(member.stripe_customer_id);
    if (!sub) return { error: 'Aucun abonnement en cours.' };
    const { result } = await applyPeriodChange(sub, target, member.id);
    await logAudit(session, 'membre.formule_changee', { type: 'profile', id: member.id }, { periode: target, effet: result });
    refresh(member.id);
    const label = target === 'annuel' ? 'annuelle' : 'mensuelle';
    return {
      ok: true,
      message:
        result === 'deja' ? 'C’est déjà sa formule.' : result === 'annule' ? 'Changement de formule annulé.' : result === 'essai' ? `Formule ${label} à la fin de l’essai.` : `Passage en formule ${label} programmé à la prochaine échéance.`,
    };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

// ---------------------------------------------------------------------
// Remboursement d'une facture (total ou partiel) : avoir automatique
// ---------------------------------------------------------------------

/** Montant encore remboursable d'une facture (déduction des avoirs déjà émis). */
async function refundable(invoice: InvoiceRow) {
  const { data } = await createServiceClient().from('invoices').select('total_cents').eq('credited_invoice_id', invoice.id);
  const credited = (data ?? []).reduce((s, r) => s + (r.total_cents as number), 0);
  return Math.max(0, invoice.total_cents - credited);
}

export async function refundInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/factures');
  if (!hasRecentMfa(session)) return { error: RECENT_MFA };
  const invoice = await loadInvoice(formData);
  if (!invoice || invoice.kind !== 'facture' || !invoice.stripe_invoice_id) return { error: 'Facture introuvable.' };
  const left = await refundable(invoice);
  if (left <= 0) return { error: 'Cette facture est déjà entièrement remboursée.' };
  const raw = String(formData.get('montant') ?? '').trim().replace(',', '.');
  const amount = raw === '' ? left : Math.round(Number(raw) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Montant invalide.' };
  if (amount > left) return { error: `Au plus ${euros(left, invoice.currency)} remboursables sur cette facture.` };

  try {
    const payments = await stripe().invoicePayments.list({ invoice: invoice.stripe_invoice_id, limit: 5 });
    const paid = payments.data.find((p) => p.status === 'paid') ?? payments.data[0];
    const ref = paid?.payment;
    const params: Stripe.RefundCreateParams = { amount, reason: 'requested_by_customer', metadata: { facture: invoice.stripe_invoice_id, numero: invoice.number, admin: session.email } };
    if (ref?.payment_intent) params.payment_intent = typeof ref.payment_intent === 'string' ? ref.payment_intent : ref.payment_intent.id;
    else if (ref?.charge) params.charge = typeof ref.charge === 'string' ? ref.charge : ref.charge.id;
    else return { error: 'Paiement introuvable chez Stripe pour cette facture.' };

    const refund = await stripe().refunds.create(params, { idempotencyKey: `remboursement-${invoice.id}-${left}-${amount}` });
    const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
    let note = '';
    if (chargeId) {
      await onChargeRefunded(await stripe().charges.retrieve(chargeId), `admin-${refund.id}`);
      const { data } = await createServiceClient().from('invoices').select('number').eq('stripe_refund_id', refund.id).maybeSingle();
      if (data?.number) note = ` Avoir ${data.number} émis et envoyé au membre.`;
    }
    if (amount === left) await createServiceClient().from('payments').update({ status: 'refunded' }).eq('id', invoice.stripe_invoice_id);
    await logAudit(session, 'facture.remboursee', { type: 'invoice', id: invoice.id }, { facture: invoice.number, montant: euros(amount, invoice.currency) });
    refresh(invoice.user_id);
    return { ok: true, message: `${euros(amount, invoice.currency)} remboursés sur la facture ${invoice.number}.${note} L’argent revient sur la carte sous 5 à 10 jours.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

// ---------------------------------------------------------------------
// Renvoi d'une facture ou d'un avoir par e-mail
// ---------------------------------------------------------------------

export async function resendInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/factures');
  const invoice = await loadInvoice(formData);
  if (!invoice) return { error: 'Document introuvable.' };
  if (!invoice.user_id) return { error: 'Le compte de ce client a été supprimé : téléchargez le PDF et envoyez-le à la main.' };
  try {
    let creditedNumber: string | undefined;
    if (invoice.credited_invoice_id) {
      const { data } = await createServiceClient().from('invoices').select('number').eq('id', invoice.credited_invoice_id).maybeSingle();
      creditedNumber = data?.number;
    }
    const file = await invoiceAttachment(invoice, creditedNumber);
    await notifyBilling(
      invoice.kind === 'avoir' ? 'remboursement' : 'paiement_recu',
      { userId: invoice.user_id },
      { amount: euros(invoice.total_cents, invoice.currency), invoiceNumber: invoice.number, invoiceUrl: file.url, offered: invoice.kind === 'facture' && invoice.total_cents === 0 },
      `renvoi-${invoice.id}-${Date.now()}`,
      file.attachments,
    );
    await logAudit(session, 'facture.renvoyee', { type: 'invoice', id: invoice.id }, { numero: invoice.number });
    return { ok: true, message: `${invoice.kind === 'avoir' ? 'Avoir' : 'Facture'} ${invoice.number} renvoyé par e-mail.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

// ---------------------------------------------------------------------
// Informations de facturation d'un membre
// ---------------------------------------------------------------------

export async function adminUpdateBilling(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const member = await memberOf(formData);
  if (!member) return { error: 'Membre introuvable.' };
  const parsed = billingFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Informations incomplètes.' };
  try {
    await saveBillingDetails(member.id, parsed.data, member.stripe_customer_id);
    await logAudit(session, 'membre.facturation_modifiee', { type: 'profile', id: member.id });
    refresh(member.id);
    return { ok: true, message: 'Enregistré : les prochaines factures porteront ces informations.' };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

// ---------------------------------------------------------------------
// Codes promotionnels
// ---------------------------------------------------------------------

const promoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, 'Code : 3 à 30 lettres, chiffres, tirets.'),
    type: z.enum(['pourcent', 'montant']),
    valeur: z.coerce.number().positive('Indiquez la réduction.'),
    duree: z.enum(['once', 'repeating', 'forever']),
    mois: z.coerce.number().int().min(1).max(36).optional(),
    max: z.coerce.number().int().min(1).max(100000).optional(),
    expire: z.string().optional(),
    premier: z.boolean(),
    nom: z.string().trim().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'pourcent' && v.valeur > 100) ctx.addIssue({ code: 'custom', path: ['valeur'], message: 'Au plus 100 %.' });
    if (v.duree === 'repeating' && !v.mois) ctx.addIssue({ code: 'custom', path: ['mois'], message: 'Indiquez le nombre de mois.' });
  });

export async function createPromoCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/codes-promo');
  const empty = (k: string) => {
    const v = formData.get(k);
    return v === null || v === '' ? undefined : String(v);
  };
  const parsed = promoSchema.safeParse({
    code: formData.get('code'),
    type: formData.get('type'),
    valeur: String(formData.get('valeur') ?? '').replace(',', '.'),
    duree: formData.get('duree'),
    mois: empty('mois'),
    max: empty('max'),
    expire: empty('expire'),
    premier: formData.get('premier') === 'on',
    nom: empty('nom'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Formulaire incomplet.' };
  const v = parsed.data;
  const expiresAt = v.expire ? Math.floor(new Date(`${v.expire}T23:59:59+01:00`).getTime() / 1000) : undefined;
  if (expiresAt && expiresAt * 1000 < Date.now()) return { error: 'La date d’expiration est passée.' };

  try {
    const existing = await stripe().promotionCodes.list({ code: v.code, limit: 1 });
    if (existing.data.length) return { error: `Le code ${v.code} existe déjà.` };
    const coupon = await stripe().coupons.create({
      name: v.nom || v.code,
      ...(v.type === 'pourcent' ? { percent_off: v.valeur } : { amount_off: Math.round(v.valeur * 100), currency: 'eur' }),
      duration: v.duree,
      ...(v.duree === 'repeating' ? { duration_in_months: v.mois } : {}),
      metadata: { cree_par: session.email },
    });
    await stripe().promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: v.code,
      ...(v.max ? { max_redemptions: v.max } : {}),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      ...(v.premier ? { restrictions: { first_time_transaction: true } } : {}),
    });
    await logAudit(session, 'code_promo.cree', { type: 'promotion_code', id: v.code }, { reduction: v.type === 'pourcent' ? `${v.valeur} %` : `${v.valeur} €`, duree: v.duree });
    revalidatePath('/admin/codes-promo');
    return { ok: true, message: `Code ${v.code} créé : les membres peuvent le saisir sur la page Abonnement.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

export async function setPromoCodeActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/codes-promo');
  const id = z.string().regex(/^promo_[A-Za-z0-9]+$/).safeParse(formData.get('promo_id'));
  if (!id.success) return { error: 'Code introuvable.' };
  const active = formData.get('active') === '1';
  try {
    const promo = await stripe().promotionCodes.update(id.data, { active });
    await logAudit(session, active ? 'code_promo.reactive' : 'code_promo.desactive', { type: 'promotion_code', id: promo.code });
    revalidatePath('/admin/codes-promo');
    return { ok: true, message: `Code ${promo.code} ${active ? 'réactivé' : 'désactivé'}.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

