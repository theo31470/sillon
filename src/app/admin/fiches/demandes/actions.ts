'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { env } from '@/lib/env';
import { notifySheetRequesters } from '@/lib/sheet-requests';
import type { FormState } from '@/components/form-bits';

const ids = z.array(z.string().uuid()).min(1).max(100);
const clean = (v: string) => v.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();

/** Lance la préparation de la fiche demandée : le modèle entre dans la file d'import (recherche web puis rédaction). */
export async function launchRequests(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/demandes');
  const parsedIds = ids.safeParse(formData.getAll('ids'));
  const fields = z
    .object({
      brand: z.string().trim().min(1, 'Marque manquante').max(60),
      model: z.string().trim().min(1, 'Modèle manquant').max(120),
      series: z.string().trim().max(120),
      years: z.string().trim().max(40),
    })
    .safeParse({ brand: formData.get('brand') ?? '', model: formData.get('model') ?? '', series: formData.get('series') ?? '', years: formData.get('years') ?? '' });
  if (!parsedIds.success) return { error: 'Demande introuvable.' };
  if (!fields.success) return { error: fields.error.issues[0]?.message ?? 'Champs invalides.' };
  const { brand, model, series, years } = fields.data;
  const supabase = await createClient();

  // Modèle déjà au catalogue (même marque et modèle) : on le remet en file, sinon on l'ajoute.
  const { data: known } = await supabase.from('catalog_models').select('id, status').ilike('brand', clean(brand)).ilike('model', clean(model)).limit(1).maybeSingle();
  let catalogId = known?.id as string | undefined;
  if (known && ['researching', 'researched', 'writing', 'queued'].includes(known.status as string)) {
    // Déjà en cours : rien à relancer.
  } else if (known) {
    await supabase
      .from('catalog_models')
      .update({ status: 'queued', queued_at: new Date().toISOString(), attempts: 0, error: null, created_by: session.userId, ...(series ? { series } : {}), ...(years ? { years } : {}) })
      .eq('id', known.id);
  } else {
    const { data: inserted, error } = await supabase
      .from('catalog_models')
      .insert({ brand, model, series, years, status: 'queued', queued_at: new Date().toISOString(), created_by: session.userId })
      .select('id')
      .single();
    if (error || !inserted) return { error: 'Ajout à la file impossible.' };
    catalogId = inserted.id as string;
  }

  await createServiceClient().from('sheet_requests').update({ status: 'lancee', catalog_model_id: catalogId }).in('id', parsedIds.data).in('status', ['nouvelle', 'refusee']);
  await logAudit(session, 'demande_fiche.lancee', undefined, { modele: `${brand} ${model}`, demandes: parsedIds.data.length });
  try {
    await fetch(new URL('/api/catalogue/tick', env.siteUrl()), { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch {
    /* la tâche planifiée prendra le relais */
  }
  revalidatePath('/admin/fiches/demandes');
  return { ok: true, message: `Préparation lancée pour ${brand} ${model}. La fiche arrivera dans « À relire » ; les membres seront prévenus à sa publication.` };
}

/** La fiche existe déjà (publiée) : on la rattache et on prévient les membres. */
export async function linkRequests(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/demandes');
  const parsedIds = ids.safeParse(formData.getAll('ids'));
  const sheetId = z.string().uuid().safeParse(formData.get('sheet_id'));
  if (!parsedIds.success || !sheetId.success) return { error: 'Demande ou fiche introuvable.' };
  await createServiceClient().from('sheet_requests').update({ sheet_id: sheetId.data, status: 'lancee' }).in('id', parsedIds.data).is('notified_at', null);
  const sent = await notifySheetRequesters(sheetId.data);
  await logAudit(session, 'demande_fiche.rattachee', { type: 'tech_sheet', id: sheetId.data }, { demandes: parsedIds.data.length });
  revalidatePath('/admin/fiches/demandes');
  return { ok: true, message: `${sent} membre${sent > 1 ? 's' : ''} prévenu${sent > 1 ? 's' : ''} par e-mail.` };
}

/** Modèle introuvable ou hors sujet : la demande est close, avec un mot visible par le membre. */
export async function declineRequests(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/demandes');
  const parsedIds = ids.safeParse(formData.getAll('ids'));
  const note = z.string().trim().max(300).safeParse(formData.get('note') ?? '');
  if (!parsedIds.success || !note.success) return { error: 'Demande introuvable.' };
  await createServiceClient().from('sheet_requests').update({ status: 'refusee', admin_note: note.data }).in('id', parsedIds.data).in('status', ['nouvelle', 'lancee']);
  await logAudit(session, 'demande_fiche.refusee', undefined, { demandes: parsedIds.data.length });
  revalidatePath('/admin/fiches/demandes');
  return { ok: true, message: 'Demande close.' };
}
