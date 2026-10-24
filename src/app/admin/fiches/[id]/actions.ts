'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { reviseSheet } from '@/lib/ai';
import { downloadSources } from '@/lib/sheets/sources';
import { countPendingReview, parseSheetContent, sheetContentSchema, type SheetContent } from '@/lib/sheets/schema';
import { slugify } from '@/lib/format';
import { rateLimit } from '@/lib/rate-limit';
import type { FormState } from '@/components/form-bits';
import type { TechSheet } from '@/lib/types';

async function loadSheet(id: unknown) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('tech_sheets').select('*').eq('id', parsed.data).maybeSingle();
  return data as TechSheet | null;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const nullable = (v: string) => (v === '' ? null : v);
const num = (v: string) => {
  if (v === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);

/**
 * Applique les corrections du formulaire de relecture.
 * On part de la fiche stockée (source de vérité) et on ne lit que les champs
 * attendus : impossible d'injecter une structure arbitraire.
 */
function applyForm(content: SheetContent, fd: FormData): SheetContent {
  return {
    summary: str(fd, 'summary').slice(0, 600),
    specs: content.specs.map((g, gi) => ({
      group: g.group,
      items: g.items.map((it, ii) => ({
        ...it,
        value: nullable(str(fd, `specs.${gi}.${ii}.value`).slice(0, 200)),
        needs_review: fd.get(`specs.${gi}.${ii}.ok`) !== 'on',
      })),
    })),
    maintenance: content.maintenance.map((m, i) => ({
      ...m,
      interval_hours: num(str(fd, `maintenance.${i}.interval_hours`)),
      interval_months: num(str(fd, `maintenance.${i}.interval_months`)),
      product: nullable(str(fd, `maintenance.${i}.product`).slice(0, 160)),
      capacity: nullable(str(fd, `maintenance.${i}.capacity`).slice(0, 80)),
      needs_review: fd.get(`maintenance.${i}.ok`) !== 'on',
    })),
    faults: content.faults.map((f, i) => ({
      ...f,
      difficulty: str(fd, `faults.${i}.difficulty`) === 'atelier' ? 'atelier' : 'facile',
      causes: lines(str(fd, `faults.${i}.causes`)),
      checks: lines(str(fd, `faults.${i}.checks`)),
      needs_review: fd.get(`faults.${i}.ok`) !== 'on',
    })),
    parts: content.parts.map((p, i) => ({
      ...p,
      reference: nullable(str(fd, `parts.${i}.reference`).slice(0, 80)),
      quantity: nullable(str(fd, `parts.${i}.quantity`).slice(0, 20)),
      needs_review: fd.get(`parts.${i}.ok`) !== 'on',
    })),
  };
}

export async function saveReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return { error: 'Fiche introuvable.' };
  if (sheet.status === 'generating') return { error: 'La fiche est encore en cours de génération.' };

  const meta = z
    .object({
      title: z.string().trim().min(2, 'Titre trop court').max(160),
      slug: z.string().transform((v) => slugify(v)).refine((v) => v.length >= 2, 'Adresse invalide'),
      brand: z.string().trim().max(80),
      model: z.string().trim().max(80),
    })
    .safeParse({ title: formData.get('title'), slug: formData.get('slug') || formData.get('title'), brand: formData.get('brand') ?? '', model: formData.get('model') ?? '' });
  if (!meta.success) return { error: meta.error.issues[0].message };

  const content = sheetContentSchema.safeParse(applyForm(parseSheetContent(sheet.content), formData));
  if (!content.success) return { error: 'Contenu invalide.' };

  const pending = countPendingReview(content.data);
  const supabase = await createClient();
  const { error } = await supabase
    .from('tech_sheets')
    .update({
      ...meta.data,
      content: content.data,
      summary: content.data.summary,
      // Toute modification d'une fiche publiée la garde publiée seulement si elle reste entièrement vérifiée.
      status: sheet.status === 'published' && pending > 0 ? 'review' : sheet.status === 'rejected' ? 'review' : sheet.status,
    })
    .eq('id', sheet.id);
  if (error) return { error: error.code === '23505' ? 'Cette adresse de page est déjà utilisée.' : 'Enregistrement impossible.' };

  await logAudit(session, 'fiche.relue', { type: 'tech_sheet', id: sheet.id }, { a_verifier: pending });
  revalidatePath(`/admin/fiches/${sheet.id}`);
  revalidatePath('/fiches', 'layout');
  return { ok: true, message: pending ? `Enregistré. Encore ${pending} champ(s) à vérifier.` : 'Enregistré. Tous les champs sont vérifiés : la fiche peut être publiée.' };
}

export async function askClaude(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  const instruction = z.string().trim().min(5, 'Décrivez la correction attendue').max(1000).safeParse(formData.get('instruction'));
  if (!sheet || !instruction.success) return { error: instruction.success ? 'Fiche introuvable.' : instruction.error.issues[0].message };
  if (!rateLimit(`sheetrev:${session.userId}`, 30, 60 * 60_000).ok) return { error: 'Limite de corrections par heure atteinte.' };

  try {
    const pdfs = await downloadSources(sheet.sources ?? []);
    const content = await reviseSheet({ userId: session.userId, content: parseSheetContent(sheet.content), instruction: instruction.data, sources: pdfs });
    const supabase = await createClient();
    await supabase.from('tech_sheets').update({ content, summary: content.summary, status: 'review' }).eq('id', sheet.id);
    await logAudit(session, 'fiche.corrigee_par_ia', { type: 'tech_sheet', id: sheet.id }, { consigne: instruction.data.slice(0, 200) });
  } catch (err) {
    return { error: `Correction impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}` };
  }
  revalidatePath(`/admin/fiches/${sheet.id}`);
  return { ok: true, message: 'Claude a corrigé la fiche. Relisez les champs modifiés.' };
}

export async function publishSheet(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return { error: 'Fiche introuvable.' };
  const pending = countPendingReview(parseSheetContent(sheet.content));
  // Garde-fou côté serveur : jamais de publication avec des champs non vérifiés.
  if (pending > 0) return { error: `Impossible de publier : ${pending} champ(s) restent à vérifier. Enregistrez d’abord votre relecture.` };
  if (!['review', 'validated', 'published'].includes(sheet.status)) return { error: 'Cette fiche ne peut pas être publiée dans son état actuel.' };

  const now = new Date().toISOString();
  const supabase = await createClient();
  await supabase
    .from('tech_sheets')
    .update({ status: 'published', validated_by: session.userId, validated_at: now, published_at: sheet.published_at ?? now })
    .eq('id', sheet.id);
  await logAudit(session, 'fiche.publiee', { type: 'tech_sheet', id: sheet.id }, { titre: sheet.title });
  revalidatePath('/fiches', 'layout');
  revalidatePath(`/admin/fiches/${sheet.id}`);
  return { ok: true, message: 'Fiche publiée sur le site.' };
}

export async function changeStatus(formData: FormData) {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  const to = z.enum(['review', 'rejected']).safeParse(formData.get('to'));
  if (!sheet || !to.success) return;
  const supabase = await createClient();
  await supabase.from('tech_sheets').update({ status: to.data }).eq('id', sheet.id);
  await logAudit(session, to.data === 'rejected' ? 'fiche.rejetee' : 'fiche.depubliee', { type: 'tech_sheet', id: sheet.id });
  revalidatePath('/fiches', 'layout');
  revalidatePath(`/admin/fiches/${sheet.id}`);
}

export async function deleteSheet(formData: FormData) {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return;
  const supabase = await createClient();
  await supabase.from('tech_sheets').delete().eq('id', sheet.id);
  await logAudit(session, 'fiche.supprimee', { type: 'tech_sheet', id: sheet.id }, { titre: sheet.title });
  revalidatePath('/fiches', 'layout');
  redirect('/admin/fiches');
}
