'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasRecentMfa, requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import type { FormState } from '@/components/form-bits';

const RECENT_MFA = 'Action sensible : validez à nouveau votre code de double authentification (lien ci-dessous), puis recommencez.';

async function loadTarget(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get('user_id'));
  if (!id.success) return null;
  const { data } = await createServiceClient().from('profiles').select('*').eq('id', id.data).single();
  return data;
}

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
  revalidatePath('/admin/membres');
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
  revalidatePath('/admin/membres');
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
  return { ok: true, message: 'Compte et données supprimés.' };
}
