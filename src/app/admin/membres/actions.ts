'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type Stripe from 'stripe';
import { hasRecentMfa, requireAdmin, type Session } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { ACTIVE_STATUSES, stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { syncPlan } from '@/lib/membership';
import { messageEmail } from '@/lib/email/templates';
import { sendEmail, sendMany } from '@/lib/email/send';
import type { FormState } from '@/components/form-bits';
import type { Profile } from '@/lib/types';

const RECENT_MFA = 'Action sensible : validez à nouveau votre code de double authentification (lien en haut de la fiche), puis recommencez.';

async function loadTarget(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('user_id'));
  if (!id.success) return null;
  const { data } = await createServiceClient().from('profiles').select('*').eq('id', id.data).single();
  return (data as Profile | null) ?? null;
}

function refresh(userId?: string) {
  revalidatePath('/admin/membres');
  if (userId) revalidatePath(`/admin/membres/${userId}`);
}

/** Message lisible pour une erreur Stripe (droits de la clé restreinte, etc.). */
function stripeError(err: unknown) {
  const e = err as { type?: string; code?: string; message?: string; statusCode?: number };
  console.error('[admin stripe]', e?.message ?? err);
  if (e?.statusCode === 403 || /permission|restricted/i.test(e?.message ?? '')) {
    return 'La clé Stripe du site n’a pas le droit de faire cette opération : ajoutez la permission correspondante à la clé restreinte (Stripe → Développeurs → Clés API).';
  }
  return `Stripe a refusé l’opération : ${e?.message ?? 'erreur inconnue'}`.slice(0, 300);
}

/** Abonnement Stripe en cours d'un membre (le plus récent encore actif). */
async function currentSubscription(userId: string) {
  const { data } = await createServiceClient()
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []).find((s) => ACTIVE_STATUSES.has(s.status) || s.status === 'unpaid') ?? null;
}

async function upsertAdminFile(session: Session, userId: string, patch: Record<string, unknown>) {
  return createServiceClient()
    .from('member_admin')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString(), updated_by: session.userId });
}

// ---------------------------------------------------------------------
// Compte
// ---------------------------------------------------------------------

export async function toggleSuspension(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  if (!hasRecentMfa(session)) return { error: RECENT_MFA };
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  if (target.id === session.userId) return { error: 'Vous ne pouvez pas suspendre votre propre compte.' };

  const suspended = !target.suspended;
  const { error } = await createServiceClient().from('profiles').update({ suspended }).eq('id', target.id);
  if (error) return { error: 'Mise à jour impossible.' };
  await logAudit(session, suspended ? 'membre.suspendu' : 'membre.reactive', { type: 'profile', id: target.id }, { email: target.email });
  refresh(target.id);
  return { ok: true, message: suspended ? 'Compte suspendu.' : 'Compte réactivé.' };
}

export async function sendResetLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(target.email, { redirectTo: `${env.siteUrl()}/auth/confirm?suite=/app/compte` });
  if (error) return { error: 'Envoi impossible pour le moment.' };
  await logAudit(session, 'membre.lien_reinitialisation_envoye', { type: 'profile', id: target.id });
  return { ok: true, message: `Lien envoyé à ${target.email}.` };
}

export async function setRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  if (!hasRecentMfa(session)) return { error: RECENT_MFA };
  const target = await loadTarget(formData);
  const role = z.enum(['member', 'admin']).safeParse(formData.get('role'));
  if (!target || !role.success) return { error: 'Requête invalide.' };
  if (target.id === session.userId) return { error: 'Vous ne pouvez pas modifier votre propre rôle.' };

  const { error } = await createServiceClient().from('profiles').update({ role: role.data }).eq('id', target.id);
  if (error) return { error: 'Mise à jour impossible.' };
  await logAudit(session, role.data === 'admin' ? 'membre.promu_admin' : 'membre.retire_admin', { type: 'profile', id: target.id }, { email: target.email });
  refresh(target.id);
  return {
    ok: true,
    message: role.data === 'admin' ? 'Droits admin accordés. La personne devra activer la double authentification.' : 'Droits admin retirés.',
  };
}

export async function deleteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  if (!hasRecentMfa(session)) return { error: RECENT_MFA };
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  if (target.id === session.userId || target.role === 'admin') return { error: 'Retirez d’abord les droits admin de ce compte.' };
  if (formData.get('confirm') !== target.email) return { error: 'Recopiez exactement l’adresse e-mail du membre pour confirmer.' };

  if (target.stripe_customer_id) {
    try {
      const subs = await stripe().subscriptions.list({ customer: target.stripe_customer_id, status: 'all', limit: 20 });
      for (const sub of subs.data.filter((s) => s.status !== 'canceled')) await stripe().subscriptions.cancel(sub.id);
    } catch {
      return { error: 'Résiliation Stripe impossible : suppression annulée.' };
    }
  }
  await logAudit(session, 'membre.supprime', { type: 'profile', id: target.id }, { email: target.email, demande: 'rgpd' });
  const { error } = await createServiceClient().auth.admin.deleteUser(target.id);
  if (error) return { error: 'Suppression impossible.' };
  revalidatePath('/admin/membres');
  redirect('/admin/membres?supprime=1');
}

const infoSchema = z.object({
  full_name: z.string().trim().max(120),
  farm_name: z.string().trim().max(120),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(254),
});

export async function updateMemberInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const parsed = infoSchema.safeParse({ full_name: formData.get('full_name'), farm_name: formData.get('farm_name'), email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { full_name, farm_name, email } = parsed.data;
  const emailChanged = email !== target.email.toLowerCase();
  // Changer l'adresse de connexion d'un compte est sensible (prise de contrôle).
  if (emailChanged && !hasRecentMfa(session)) return { error: RECENT_MFA };

  const db = createServiceClient();
  if (emailChanged) {
    const { error } = await db.auth.admin.updateUserById(target.id, { email, email_confirm: true });
    if (error) return { error: /already|exists|registered/i.test(error.message) ? 'Cette adresse est déjà utilisée par un autre compte.' : 'Changement d’adresse impossible.' };
    if (target.stripe_customer_id) {
      try {
        await stripe().customers.update(target.stripe_customer_id, { email });
      } catch (err) {
        console.error('[admin] e-mail Stripe', err);
      }
    }
  }
  const { error } = await db.from('profiles').update({ full_name, farm_name }).eq('id', target.id);
  if (error) return { error: 'Mise à jour impossible.' };
  await logAudit(session, 'membre.infos_modifiees', { type: 'profile', id: target.id }, {
    ...(emailChanged ? { ancien_email: target.email, nouvel_email: email } : {}),
    ...(full_name !== target.full_name ? { nom: full_name } : {}),
    ...(farm_name !== target.farm_name ? { exploitation: farm_name } : {}),
  });
  refresh(target.id);
  return { ok: true, message: emailChanged ? 'Informations enregistrées. La nouvelle adresse sert dès maintenant à se connecter.' : 'Informations enregistrées.' };
}

// ---------------------------------------------------------------------
// Notes, étiquettes, quota
// ---------------------------------------------------------------------

const normalizeTag = (t: string) =>
  t
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} '’-]/gu, '')
    .slice(0, 30);

function parseTags(raw: FormDataEntryValue | null) {
  return [...new Set(String(raw ?? '').split(',').map(normalizeTag).filter(Boolean))].slice(0, 12);
}

export async function saveAdminNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const note = String(formData.get('note') ?? '').slice(0, 5000);
  const tags = parseTags(formData.get('tags'));
  const { error } = await upsertAdminFile(session, target.id, { note, tags });
  if (error) return { error: 'Enregistrement impossible.' };
  await logAudit(session, 'membre.note_modifiee', { type: 'profile', id: target.id }, { etiquettes: tags });
  refresh(target.id);
  return { ok: true, message: 'Note et étiquettes enregistrées.' };
}

export async function setDiagnosticQuota(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const raw = String(formData.get('limit') ?? '').trim();
  const parsed = raw === '' ? { success: true as const, data: null } : z.coerce.number().int().min(0).max(1000).safeParse(raw);
  if (!parsed.success) return { error: 'Indiquez un nombre entre 0 et 1000, ou laissez vide pour le quota normal.' };
  const { error } = await upsertAdminFile(session, target.id, { diag_monthly_limit: parsed.data });
  if (error) return { error: 'Enregistrement impossible.' };
  await logAudit(session, 'membre.quota_diagnostic', { type: 'profile', id: target.id }, { par_mois: parsed.data ?? 'défaut' });
  refresh(target.id);
  return { ok: true, message: parsed.data === null ? 'Quota normal rétabli.' : `Quota fixé à ${parsed.data} diagnostics par mois.` };
}

// ---------------------------------------------------------------------
// Formule offerte (hors Stripe)
// ---------------------------------------------------------------------

export async function grantComp(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const duree = String(formData.get('duree') ?? '');
  let until: Date | null = null;
  if (duree === 'date') {
    const d = new Date(`${formData.get('date')}T23:59:59+01:00`);
    if (Number.isNaN(d.getTime()) || d <= new Date()) return { error: 'Choisissez une date de fin dans le futur.' };
    until = d;
  } else if (duree !== 'illimite') {
    const months = Number(duree);
    if (![1, 3, 6, 12].includes(months)) return { error: 'Durée invalide.' };
    // Prolonge une formule offerte en cours plutôt que de repartir d'aujourd'hui.
    const base = target.comp_active && target.comp_until && new Date(target.comp_until) > new Date() ? new Date(target.comp_until) : new Date();
    until = new Date(base);
    until.setMonth(until.getMonth() + months);
  }
  const db = createServiceClient();
  const { error } = await db.from('profiles').update({ comp_active: true, comp_until: until?.toISOString() ?? null }).eq('id', target.id);
  if (error) return { error: 'Mise à jour impossible.' };
  await syncPlan(target.id);
  await logAudit(session, 'membre.formule_offerte', { type: 'profile', id: target.id }, { jusqu_au: until?.toISOString() ?? 'sans fin' });
  refresh(target.id);
  return { ok: true, message: until ? `Formule Complet offerte jusqu’au ${until.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Formule Complet offerte sans date de fin.' };
}

export async function revokeComp(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const { error } = await createServiceClient().from('profiles').update({ comp_active: false, comp_until: null }).eq('id', target.id);
  if (error) return { error: 'Mise à jour impossible.' };
  const plan = await syncPlan(target.id);
  await logAudit(session, 'membre.formule_offerte_retiree', { type: 'profile', id: target.id });
  refresh(target.id);
  return { ok: true, message: plan === 'free' ? 'Formule offerte retirée : le compte repasse en Gratuit.' : 'Formule offerte retirée (le membre garde son abonnement payant).' };
}

// ---------------------------------------------------------------------
// Abonnement Stripe
// ---------------------------------------------------------------------

export async function extendTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const days = z.coerce.number().int().min(1).max(365).safeParse(formData.get('jours'));
  if (!days.success) return { error: 'Indiquez un nombre de jours entre 1 et 365.' };
  const current = await currentSubscription(target.id);
  if (!current) return { error: 'Ce membre n’a pas d’abonnement Stripe en cours. Utilisez plutôt « Offrir la formule Complet ».' };

  try {
    const sub = await stripe().subscriptions.retrieve(current.id);
    const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
    const base = Math.max(Math.floor(Date.now() / 1000), sub.status === 'trialing' ? (sub.trial_end ?? 0) : periodEnd);
    const trialEnd = base + days.data * 86400;
    await stripe().subscriptions.update(sub.id, { trial_end: trialEnd, proration_behavior: 'none' });
    await logAudit(session, 'membre.essai_prolonge', { type: 'profile', id: target.id }, { jours: days.data, abonnement: sub.id });
    refresh(target.id);
    const date = new Date(trialEnd * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return { ok: true, message: `${days.data} jours offerts : prochain paiement le ${date}. La fiche se met à jour dans quelques secondes.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

export async function manageSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const mode = z.enum(['fin', 'reprendre', 'immediat']).safeParse(formData.get('mode'));
  if (!mode.success) return { error: 'Requête invalide.' };
  if (mode.data === 'immediat' && !hasRecentMfa(session)) return { error: RECENT_MFA };
  const current = await currentSubscription(target.id);
  if (!current) return { error: 'Aucun abonnement Stripe en cours.' };

  try {
    if (mode.data === 'immediat') await stripe().subscriptions.cancel(current.id);
    else await stripe().subscriptions.update(current.id, { cancel_at_period_end: mode.data === 'fin' });
    await logAudit(session, `membre.abonnement_${mode.data === 'fin' ? 'resiliation_programmee' : mode.data === 'reprendre' ? 'resiliation_annulee' : 'resilie_immediatement'}`, { type: 'profile', id: target.id }, { abonnement: current.id });
    refresh(target.id);
    return {
      ok: true,
      message:
        mode.data === 'fin'
          ? 'Résiliation programmée en fin de période. Le membre reçoit un e-mail de confirmation.'
          : mode.data === 'reprendre'
            ? 'Résiliation annulée : l’abonnement continue.'
            : 'Abonnement résilié immédiatement. Le compte repasse en Gratuit dans quelques secondes.',
    };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

export async function refundLastPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  if (!hasRecentMfa(session)) return { error: RECENT_MFA };
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const db = createServiceClient();
  const { data: payment } = await db
    .from('payments')
    .select('id, amount_cents, currency')
    .eq('user_id', target.id)
    .eq('status', 'paid')
    .gt('amount_cents', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!payment) return { error: 'Aucun paiement remboursable pour ce membre.' };

  try {
    const invoicePayments = await stripe().invoicePayments.list({ invoice: payment.id, limit: 5 });
    const paid = invoicePayments.data.find((p) => p.status === 'paid') ?? invoicePayments.data[0];
    const ref = paid?.payment;
    const params: Stripe.RefundCreateParams = { reason: 'requested_by_customer', metadata: { facture: payment.id, admin: session.email } };
    if (ref?.payment_intent) params.payment_intent = typeof ref.payment_intent === 'string' ? ref.payment_intent : ref.payment_intent.id;
    else if (ref?.charge) params.charge = typeof ref.charge === 'string' ? ref.charge : ref.charge.id;
    else return { error: 'Paiement introuvable chez Stripe pour cette facture.' };
    await stripe().refunds.create(params, { idempotencyKey: `remboursement-${payment.id}` });
    await db.from('payments').update({ status: 'refunded' }).eq('id', payment.id);
    const amount = (payment.amount_cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: payment.currency.toUpperCase() });
    await logAudit(session, 'membre.paiement_rembourse', { type: 'profile', id: target.id }, { facture: payment.id, montant: amount });
    refresh(target.id);
    return { ok: true, message: `${amount} remboursés. L’argent revient sur la carte du membre sous 5 à 10 jours. Pensez à résilier l’abonnement si besoin.` };
  } catch (err) {
    return { error: stripeError(err) };
  }
}

// ---------------------------------------------------------------------
// Message personnel
// ---------------------------------------------------------------------

const messageSchema = z.object({
  subject: z.string().trim().min(3, 'Objet trop court.').max(150),
  body: z.string().trim().min(10, 'Message trop court.').max(10_000),
});

export async function sendMemberMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const target = await loadTarget(formData);
  if (!target) return { error: 'Membre introuvable.' };
  const parsed = messageSchema.safeParse({ subject: formData.get('subject'), body: formData.get('body') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await sendEmail({
    to: target.email,
    email: messageEmail({ subject: parsed.data.subject, bodyMd: parsed.data.body, name: target.full_name }, env.siteUrl()),
    kind: 'message',
    template: 'message_admin',
    userId: target.id,
  });
  if (!r.ok) return { error: `Envoi impossible : ${r.error}` };
  await logAudit(session, 'membre.message_envoye', { type: 'profile', id: target.id }, { objet: parsed.data.subject });
  refresh(target.id);
  return { ok: true, message: `Message envoyé à ${target.email}. Les réponses arrivent sur contact@.` };
}

// ---------------------------------------------------------------------
// Actions groupées (liste des membres)
// ---------------------------------------------------------------------

export async function bulkMembers(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/membres');
  const ids = z.array(z.string().uuid()).min(1).max(200).safeParse(formData.getAll('ids'));
  if (!ids.success) return { error: 'Cochez au moins un membre.' };
  const action = z.enum(['tag_add', 'tag_remove', 'suspend', 'reactivate', 'message']).safeParse(formData.get('bulk_action'));
  if (!action.success) return { error: 'Choisissez une action.' };
  const db = createServiceClient();
  const { data: members } = await db.from('profiles').select('id, email, full_name, role, suspended').in('id', ids.data);
  const list = members ?? [];

  if (action.data === 'tag_add' || action.data === 'tag_remove') {
    const tag = normalizeTag(String(formData.get('tag') ?? ''));
    if (!tag) return { error: 'Indiquez l’étiquette.' };
    const { data: files } = await db.from('member_admin').select('user_id, tags').in('user_id', ids.data);
    const current = new Map((files ?? []).map((f) => [f.user_id, f.tags as string[]]));
    const rows = list.map((m) => {
      const tags = current.get(m.id) ?? [];
      const next = action.data === 'tag_add' ? [...new Set([...tags, tag])].slice(0, 12) : tags.filter((t) => t !== tag);
      return { user_id: m.id, tags: next, updated_at: new Date().toISOString(), updated_by: session.userId };
    });
    const { error } = await db.from('member_admin').upsert(rows);
    if (error) return { error: 'Enregistrement impossible.' };
    await logAudit(session, action.data === 'tag_add' ? 'membres.etiquette_ajoutee' : 'membres.etiquette_retiree', undefined, { etiquette: tag, membres: rows.length });
    refresh();
    return { ok: true, message: `Étiquette « ${tag} » ${action.data === 'tag_add' ? 'ajoutée à' : 'retirée de'} ${rows.length} membre${rows.length > 1 ? 's' : ''}.` };
  }

  if (action.data === 'suspend' || action.data === 'reactivate') {
    if (!hasRecentMfa(session)) return { error: RECENT_MFA };
    const suspended = action.data === 'suspend';
    // Jamais son propre compte ni un autre admin.
    const targets = list.filter((m) => m.id !== session.userId && m.role !== 'admin' && m.suspended !== suspended);
    if (!targets.length) return { error: 'Aucun membre concerné (les admins et votre compte sont exclus).' };
    const { error } = await db.from('profiles').update({ suspended }).in('id', targets.map((m) => m.id));
    if (error) return { error: 'Mise à jour impossible.' };
    for (const m of targets) await logAudit(session, suspended ? 'membre.suspendu' : 'membre.reactive', { type: 'profile', id: m.id }, { email: m.email, groupe: true });
    refresh();
    return { ok: true, message: `${targets.length} compte${targets.length > 1 ? 's' : ''} ${suspended ? 'suspendu' : 'réactivé'}${targets.length > 1 ? 's' : ''}.` };
  }

  const parsed = messageSchema.safeParse({ subject: formData.get('subject'), body: formData.get('body') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const site = env.siteUrl();
  const res = await sendMany(
    list.map((m) => ({
      to: m.email,
      email: messageEmail({ subject: parsed.data.subject, bodyMd: parsed.data.body, name: m.full_name }, site),
      kind: 'message' as const,
      template: 'message_admin',
      userId: m.id,
    })),
  );
  await logAudit(session, 'membres.message_groupe', undefined, { objet: parsed.data.subject, envoyes: res.sent, echecs: res.failed });
  refresh();
  if (!res.sent) return { error: 'Aucun e-mail n’a pu partir. Voir le journal dans E-mails.' };
  return { ok: true, message: `Message envoyé à ${res.sent} membre${res.sent > 1 ? 's' : ''}${res.failed ? ` (${res.failed} échec${res.failed > 1 ? 's' : ''})` : ''}.` };
}
