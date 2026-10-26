'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { generateSheet, reviseSheet } from '@/lib/ai';
import { downloadSources } from '@/lib/sheets/sources';
import { countPendingReview, ORIGINS, parseSheetContent, sheetContentSchema, type InfoOrigin, type SheetContent } from '@/lib/sheets/schema';
import { slugify } from '@/lib/format';
import { rateLimit } from '@/lib/rate-limit';
import type { FormState } from '@/components/form-bits';
import type { PhotoCredit, TechSheet } from '@/lib/types';
import { attachCommonsPhoto } from '@/lib/photos';
import { createServiceClient } from '@/lib/supabase/admin';

async function loadSheet(id: unknown) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('tech_sheets').select('*').eq('id', parsed.data).maybeSingle();
  return data as TechSheet | null;
}

/** Dossier de recherche web d'une fiche importée par marque (null sinon). */
async function researchNotesFor(sheetId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('catalog_models').select('research_notes').eq('sheet_id', sheetId).maybeSingle();
  return (data?.research_notes as string | null) ?? null;
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
const pickOrigin = (v: string, fallback: InfoOrigin): InfoOrigin => ((ORIGINS as readonly string[]).includes(v) ? (v as InfoOrigin) : fallback);
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
      origin: pickOrigin(str(fd, `maintenance.${i}.origin`), m.origin),
      needs_review: fd.get(`maintenance.${i}.ok`) !== 'on',
    })),
    faults: content.faults.map((f, i) => ({
      ...f,
      difficulty: str(fd, `faults.${i}.difficulty`) === 'atelier' ? 'atelier' : 'facile',
      causes: lines(str(fd, `faults.${i}.causes`)),
      checks: lines(str(fd, `faults.${i}.checks`)),
      origin: pickOrigin(str(fd, `faults.${i}.origin`), f.origin),
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
    const researchNotes = await researchNotesFor(sheet.id);
    if (!pdfs.length && !researchNotes) return { error: 'Aucune source disponible pour cette fiche.' };
    const content = await reviseSheet({ userId: session.userId, content: parseSheetContent(sheet.content), instruction: instruction.data, sources: pdfs, researchNotes });
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

/** Relance la rédaction par Claude avec les documents déjà envoyés (après un échec). */
export async function regenerateSheet(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return { error: 'Fiche introuvable.' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Claude n’est pas encore configuré (ANTHROPIC_API_KEY manquante).' };

  // Fiche importée depuis le web : on la remet dans la file d'import (nouvelle recherche).
  if (!sheet.sources?.some((s) => s.path)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('catalog_models')
      .update({ status: 'queued', queued_at: new Date().toISOString(), attempts: 0, error: null, created_by: session.userId })
      .eq('sheet_id', sheet.id)
      .select('id');
    if (!data?.length) return { error: 'Aucun document source enregistré pour cette fiche.' };
    await logAudit(session, 'fiche.recherche_relancee', { type: 'tech_sheet', id: sheet.id });
    return { ok: true, message: 'Nouvelle recherche lancée : la fiche sera mise à jour dans quelques minutes (suivi dans « Import par marque »).' };
  }
  if (!rateLimit(`sheetgen:${session.userId}`, 20, 60 * 60_000).ok) return { error: 'Limite de 20 générations par heure atteinte.' };

  const supabase = await createClient();
  await supabase.from('tech_sheets').update({ status: 'generating', summary: '' }).eq('id', sheet.id);
  try {
    const pdfs = await downloadSources(sheet.sources);
    const { content, model } = await generateSheet({
      userId: session.userId,
      title: sheet.title,
      category: sheet.category,
      brand: sheet.brand,
      model: sheet.model,
      sections: ['caractéristiques techniques', 'plan d’entretien', 'pannes fréquentes et vérifications', 'pièces d’entretien et références'],
      sources: pdfs,
    });
    await supabase.from('tech_sheets').update({ content, summary: content.summary, status: 'review', ai_model: model }).eq('id', sheet.id);
    await logAudit(session, 'fiche.generee_par_ia', { type: 'tech_sheet', id: sheet.id }, { relance: true, a_verifier: countPendingReview(content), modele: model });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    await supabase.from('tech_sheets').update({ status: 'rejected', summary: `Échec de la génération : ${message}`.slice(0, 300) }).eq('id', sheet.id);
    revalidatePath(`/admin/fiches/${sheet.id}`);
    return { error: `La génération a échoué : ${message}` };
  }
  revalidatePath(`/admin/fiches/${sheet.id}`);
  return { ok: true, message: 'Fiche rédigée par Claude. Relisez chaque champ avant de publier.' };
}

// ---------------------------------------------------------------------
// Photo de la fiche
// ---------------------------------------------------------------------

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Supprime du stockage une ancienne photo déposée chez nous. */
async function removeStoredPhoto(url: string | null) {
  const marker = '/storage/v1/object/public/media/';
  if (!url?.includes(marker)) return;
  const path = decodeURIComponent(url.split(marker)[1] ?? '');
  if (/^fiches\/[0-9a-f-]{36}\/[\w.-]+$/.test(path)) await createServiceClient().storage.from('media').remove([path]);
}

/** Cherche une photo libre (Wikimedia Commons) et la choisit avec Claude. */
export async function findPhoto(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return { error: 'Fiche introuvable.' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Claude n’est pas configuré.' };
  if (!rateLimit(`photo:${session.userId}`, 30, 60 * 60_000).ok) return { error: 'Limite de recherches de photos atteinte pour cette heure.' };
  const previous = sheet.cover_url;
  try {
    const { data: cat } = await createServiceClient().from('catalog_models').select('series').eq('sheet_id', sheet.id).limit(1).maybeSingle();
    const credit = await attachCommonsPhoto({ userId: session.userId, sheetId: sheet.id, brand: sheet.brand, model: sheet.model || sheet.title, series: cat?.series ?? null });
    if (!credit) return { error: 'Aucune photo libre ne montre clairement ce modèle ni un modèle de la même série. Vous pouvez en déposer une.' };
    await removeStoredPhoto(previous);
    await logAudit(session, 'fiche.photo_libre', { type: 'tech_sheet', id: sheet.id }, { auteur: credit.author, licence: credit.license, source: credit.source_url });
  } catch (err) {
    return { error: `Recherche impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}` };
  }
  revalidatePath(`/admin/fiches/${sheet.id}`);
  revalidatePath('/fiches', 'layout');
  return { ok: true, message: 'Photo ajoutée avec son crédit. Vérifiez qu’elle montre bien ce modèle.' };
}

const manualPhotoSchema = z.object({
  author: z.string().trim().min(2, 'Indiquez l’auteur ou le détenteur des droits').max(120),
  license: z.string().trim().min(3, 'Indiquez la licence ou l’autorisation obtenue').max(160),
  source_url: z.union([z.literal(''), z.string().trim().url('Adresse de la source invalide').max(500)]),
  rights: z.literal('on', { error: 'Confirmez que vous avez le droit de publier cette photo' }),
});

/** Dépôt manuel d'une photo (photo presse autorisée, photo personnelle…), crédit obligatoire. */
export async function uploadPhoto(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return { error: 'Fiche introuvable.' };
  const meta = manualPhotoSchema.safeParse({
    author: formData.get('author'),
    license: formData.get('license'),
    source_url: formData.get('source_url') ?? '',
    rights: formData.get('rights'),
  });
  if (!meta.success) return { error: meta.error.issues[0].message };
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisissez une photo.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: 'Formats acceptés : JPG, PNG ou WebP.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'Photo trop lourde (5 Mo maximum).' };

  const supabase = await createClient();
  const path = `fiches/${sheet.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: 'Envoi de la photo impossible.' };
  const cover_url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  const credit: PhotoCredit = { source: 'manual', author: meta.data.author, license: meta.data.license, license_url: null, source_url: meta.data.source_url || null };
  await supabase.from('tech_sheets').update({ cover_url, cover_credit: credit }).eq('id', sheet.id);
  await removeStoredPhoto(sheet.cover_url);
  await logAudit(session, 'fiche.photo_deposee', { type: 'tech_sheet', id: sheet.id }, { auteur: credit.author, licence: credit.license });
  revalidatePath(`/admin/fiches/${sheet.id}`);
  revalidatePath('/fiches', 'layout');
  return { ok: true, message: 'Photo enregistrée avec son crédit.' };
}

export async function removePhoto(formData: FormData) {
  const { session } = await requireAdmin('/admin/fiches');
  const sheet = await loadSheet(formData.get('id'));
  if (!sheet) return;
  const supabase = await createClient();
  await supabase.from('tech_sheets').update({ cover_url: null, cover_credit: null }).eq('id', sheet.id);
  await removeStoredPhoto(sheet.cover_url);
  await logAudit(session, 'fiche.photo_retiree', { type: 'tech_sheet', id: sheet.id });
  revalidatePath(`/admin/fiches/${sheet.id}`);
  revalidatePath('/fiches', 'layout');
}
