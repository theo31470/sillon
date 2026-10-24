import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { researchModel, sheetFromResearch } from '@/lib/ai-web';
import { countPendingReview } from '@/lib/sheets/schema';
import { uniqueSheetSlug } from '@/lib/sheets/slug';
import { logAudit } from '@/lib/audit';
import type { Session } from '@/lib/auth';
import { CATALOG_DAILY_LIMIT, CATALOG_PARALLEL, type CatalogModel } from '@/lib/catalog-shared';

/** Nombre de recherches lancées depuis minuit (UTC) : garde-fou de dépense. */
export async function researchesToday() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await createServiceClient()
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('feature', 'sheet_research')
    .gte('created_at', since.toISOString());
  return count ?? 0;
}

export type ProcessResult =
  | { idle: true }
  | { idle: false; id: string; label: string; phase: 'research' | 'write'; ok: boolean; error?: string; sheetId?: string; pending?: number };

/**
 * Traite UNE étape d'UN modèle de la file : recherche web, ou rédaction de la fiche.
 * Appelée en boucle par l'écran d'import tant qu'il reste du travail.
 */
export async function processNextJob(): Promise<ProcessResult> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('claim_catalog_job', { max_active: CATALOG_PARALLEL });
  if (error) throw new Error(`File d’attente indisponible : ${error.message}`);
  const job = (data as CatalogModel[] | null)?.[0];
  if (!job) return { idle: true };
  // La consommation est rattachée à l'admin qui a lancé l'import.
  const userId = job.created_by;
  const actor: Session | null = userId ? { userId, email: 'import automatique', aal: 'system', lastMfaAt: null } : null;

  const label = `${job.brand} ${job.model}`;
  if (!userId) {
    await db.from('catalog_models').update({ status: 'error', error: 'Import sans administrateur associé', locked_at: null }).eq('id', job.id);
    return { idle: false, id: job.id, label, phase: 'research', ok: false, error: 'Import sans administrateur associé' };
  }
  const phase = job.status === 'researching' ? 'research' : 'write';

  try {
    if (phase === 'research') {
      if ((await researchesToday()) >= CATALOG_DAILY_LIMIT) {
        await db.from('catalog_models').update({ status: 'queued', locked_at: null, attempts: Math.max(0, job.attempts - 1) }).eq('id', job.id);
        throw new Error(`Limite de ${CATALOG_DAILY_LIMIT} recherches par jour atteinte. La file reprendra demain.`);
      }
      const { notes, sources } = await researchModel({ userId, brand: job.brand, series: job.series, model: job.model, years: job.years });
      await db
        .from('catalog_models')
        .update({ status: 'researched', research_notes: notes, research_sources: sources, locked_at: null })
        .eq('id', job.id);
      return { idle: false, id: job.id, label, phase, ok: true };
    }

    const { content, model } = await sheetFromResearch({ userId, brand: job.brand, model: job.model, notes: job.research_notes ?? '' });
    const pending = countPendingReview(content);
    const sources = (job.research_sources ?? []).slice(0, 30);
    let sheetId = job.sheet_id;
    if (sheetId) {
      // Nouvelle rédaction d'une fiche existante : elle repasse en relecture.
      await db.from('tech_sheets').update({ content, summary: content.summary, sources, status: 'review', ai_model: model }).eq('id', sheetId);
    } else {
      const title = `${job.brand} ${job.model}`;
      const { data: sheet, error: insertError } = await db
        .from('tech_sheets')
        .insert({ slug: await uniqueSheetSlug(title), title, category: 'machine', brand: job.brand, model: job.model, summary: content.summary, content, sources, status: 'review', ai_model: model })
        .select('id')
        .single();
      if (insertError || !sheet) throw new Error('Création de la fiche impossible');
      sheetId = sheet.id as string;
    }
    await db.from('catalog_models').update({ status: 'done', sheet_id: sheetId, locked_at: null }).eq('id', job.id);
    await logAudit(actor, 'fiche.importee_par_ia', { type: 'tech_sheet', id: sheetId }, { modele: label, a_verifier: pending, sources: sources.length });
    return { idle: false, id: job.id, label, phase, ok: true, sheetId, pending };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    console.error('[catalogue]', label, phase, message);
    // Deux nouvelles tentatives automatiques, puis l'erreur reste affichée.
    const giveUp = job.attempts >= 3 || /Limite de/.test(message);
    await db
      .from('catalog_models')
      .update({
        status: /Limite de/.test(message) ? 'queued' : giveUp ? 'error' : phase === 'research' ? 'queued' : 'researched',
        error: message.slice(0, 300),
        locked_at: null,
      })
      .eq('id', job.id);
    return { idle: false, id: job.id, label, phase, ok: false, error: message };
  }
}
