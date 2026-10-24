import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { researchSeries, researchUpkeep, sheetFromResearch, UPKEEP_MARKER } from '@/lib/ai-web';
import { countPendingReview } from '@/lib/sheets/schema';
import { uniqueSheetSlug } from '@/lib/sheets/slug';
import { logAudit } from '@/lib/audit';
import { attachCommonsPhoto } from '@/lib/photos';
import type { Session } from '@/lib/auth';
import { CATALOG_DAILY_BUDGET_USD, CATALOG_PARALLEL, type CatalogModel } from '@/lib/catalog-shared';

/** Dépense IA estimée (USD) depuis minuit UTC, toutes fonctions confondues. */
export async function spentTodayUsd() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await createServiceClient().from('ai_usage').select('cost_usd').gte('created_at', since.toISOString()).limit(5000);
  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
}

/** Met toute la file en pause (les modèles repassent « À générer »). */
async function pauseQueue(reason: string) {
  await createServiceClient()
    .from('catalog_models')
    .update({ status: 'todo', queued_at: null, locked_at: null, attempts: 0, error: reason })
    .in('status', ['queued', 'researching', 'researched', 'writing']);
}

class BudgetError extends Error {}

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
      // Recherche déjà faite pour un autre modèle de la même série : on la réutilise (aucun coût).
      if (job.series) {
        const { data: sibling } = await db
          .from('catalog_models')
          .select('research_notes, research_sources')
          .ilike('brand', job.brand)
          .eq('series', job.series)
          .like('research_notes', `%${UPKEEP_MARKER}%`)
          .neq('id', job.id)
          .gte('updated_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
          .limit(1)
          .maybeSingle();
        if (sibling?.research_notes) {
          await db
            .from('catalog_models')
            .update({ status: 'researched', research_notes: sibling.research_notes, research_sources: sibling.research_sources, locked_at: null })
            .eq('id', job.id);
          return { idle: false, id: job.id, label, phase, ok: true };
        }
      }
      if ((await spentTodayUsd()) >= CATALOG_DAILY_BUDGET_USD) {
        throw new BudgetError(`Budget du jour atteint (${CATALOG_DAILY_BUDGET_USD} $). Relancez la sélection demain ou augmentez CATALOG_DAILY_BUDGET_USD.`);
      }
      // Une seule recherche couvre tous les modèles de la série présents dans la liste.
      let models = [job.model];
      if (job.series) {
        const { data: siblings } = await db.from('catalog_models').select('model').ilike('brand', job.brand).eq('series', job.series).limit(20);
        models = [...new Set([job.model, ...(siblings ?? []).map((r) => r.model as string)])];
      }
      // Dossier technique et dossier entretien/pannes en parallèle.
      const params = { userId, brand: job.brand, series: job.series, models, years: job.years };
      const [specs, upkeep] = await Promise.all([researchSeries(params), researchUpkeep(params)]);
      const notes = `${specs.notes}\n\n${UPKEEP_MARKER}\n${upkeep.notes || 'Rien trouvé.'}`;
      const sources = [...new Map([...specs.sources, ...upkeep.sources].map((x) => [x.url, x])).values()];
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
    // Photo libre (Wikimedia Commons) : facultative, son échec ne bloque pas la fiche.
    let photo_status: 'found' | 'none' | 'error' = 'none';
    const { data: current } = await db.from('tech_sheets').select('cover_url').eq('id', sheetId).single();
    if (current?.cover_url) {
      photo_status = 'found';
    } else {
      try {
        photo_status = (await attachCommonsPhoto({ userId, sheetId, brand: job.brand, model: job.model })) ? 'found' : 'none';
      } catch (err) {
        console.error('[catalogue] photo', label, err);
        photo_status = 'error';
      }
    }
    await db.from('catalog_models').update({ status: 'done', sheet_id: sheetId, photo_status, locked_at: null }).eq('id', job.id);
    await logAudit(actor, 'fiche.importee_par_ia', { type: 'tech_sheet', id: sheetId }, { modele: label, a_verifier: pending, sources: sources.length });
    return { idle: false, id: job.id, label, phase, ok: true, sheetId, pending };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    console.error('[catalogue]', label, phase, message);
    // Budget du jour atteint ou crédits Anthropic épuisés : on arrête toute la file.
    if (err instanceof BudgetError || /credit balance|billing|insufficient|quota/i.test(message)) {
      const reason = err instanceof BudgetError ? message : 'Crédits Anthropic épuisés : file mise en pause. Rechargez puis relancez la sélection.';
      await pauseQueue(reason.slice(0, 300));
      return { idle: false, id: job.id, label, phase, ok: false, error: reason };
    }
    // Deux nouvelles tentatives automatiques, puis l'erreur reste affichée.
    const giveUp = job.attempts >= 3;
    await db
      .from('catalog_models')
      .update({
        status: giveUp ? 'error' : phase === 'research' ? 'queued' : 'researched',
        error: message.slice(0, 300),
        locked_at: null,
      })
      .eq('id', job.id);
    return { idle: false, id: job.id, label, phase, ok: false, error: message };
  }
}
