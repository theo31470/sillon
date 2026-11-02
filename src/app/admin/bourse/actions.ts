'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createServiceClient } from '@/lib/supabase/admin';
import type { FormState } from '@/components/form-bits';

/** Retire une annonce de la bourse (motif montré au vendeur). */
export async function moderateListing(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!id.success) return { error: 'Annonce introuvable.' };
  const db = createServiceClient();
  await db.from('listings').update({ status: 'moderee', moderation_note: note || 'Annonce contraire aux règles de la bourse.', updated_at: new Date().toISOString() }).eq('id', id.data);
  await db.from('listing_reports').update({ handled_at: new Date().toISOString() }).eq('listing_id', id.data).is('handled_at', null);
  await logAudit(session, 'bourse.moderation', { type: 'listing', id: id.data }, { note });
  revalidatePath('/admin/bourse');
  revalidatePath('/bourse');
  return { ok: true, message: 'Annonce retirée.' };
}

/** Signalement examiné, annonce laissée en ligne. */
export async function dismissReports(formData: FormData) {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('listing_reports').update({ handled_at: new Date().toISOString() }).eq('listing_id', id.data).is('handled_at', null);
  await logAudit(session, 'bourse.signalement_classe', { type: 'listing', id: id.data });
  revalidatePath('/admin/bourse');
}

/** Remet en ligne une annonce retirée par erreur. */
export async function restoreListing(formData: FormData) {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  await createServiceClient().from('listings').update({ status: 'en_ligne', moderation_note: null, updated_at: new Date().toISOString() }).eq('id', id.data).eq('status', 'moderee');
  await logAudit(session, 'bourse.remise_en_ligne', { type: 'listing', id: id.data });
  revalidatePath('/admin/bourse');
  revalidatePath('/bourse');
}

/** Litige ou blocage : l'équipe rembourse l'acheteur ou paie le vendeur. */
export async function resolveOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/bourse');
  const id = z.string().uuid().safeParse(formData.get('id'));
  const decision = formData.get('decision') === 'payer' ? 'payer' : formData.get('decision') === 'rembourser' ? 'rembourser' : null;
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  if (!id.success || !decision) return { error: 'Décision invalide.' };
  const { adminResolve, BourseError } = await import('@/lib/bourse-pay');
  try {
    await adminResolve(id.data, decision, note);
  } catch (err) {
    if (err instanceof BourseError) return { error: err.message };
    console.error('[bourse] décision admin', id.data, err);
    return { error: 'Stripe n’a pas accepté l’opération : voir les journaux.' };
  }
  await logAudit(session, `bourse.transaction_${decision}`, { type: 'listing_order', id: id.data }, { note });
  revalidatePath('/admin/bourse');
  return { ok: true, message: decision === 'payer' ? 'Vendeur payé.' : 'Acheteur remboursé.' };
}
