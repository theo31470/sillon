'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { listBrandModels } from '@/lib/ai-web';
import { env } from '@/lib/env';
import type { FormState } from '@/components/form-bits';

const listSchema = z.object({
  brand: z.string().trim().min(2, 'Indiquez une marque').max(60),
  scope: z.string().trim().max(120),
});

/** Étape 1 : Claude liste les modèles d'une marque (recherche web). */
export async function listModels(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/catalogue');
  const parsed = listSchema.safeParse({ brand: formData.get('brand'), scope: formData.get('scope') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Claude n’est pas configuré (ANTHROPIC_API_KEY manquante).' };
  if (!rateLimit(`catalog-list:${session.userId}`, 15, 60 * 60_000).ok) return { error: 'Limite de 15 recherches de gamme par heure atteinte.' };

  const { brand, scope } = parsed.data;
  let list;
  try {
    list = await listBrandModels({ userId: session.userId, brand, scope });
  } catch (err) {
    return { error: `Recherche impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}` };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.from('catalog_models').select('model').ilike('brand', brand);
  const known = new Set((existing ?? []).map((r) => r.model.toLowerCase()));
  const brandPrefix = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');

  const rows = [];
  for (const m of list.models) {
    const model = m.model.replace(brandPrefix, '').trim().slice(0, 120);
    if (!model || known.has(model.toLowerCase())) continue;
    known.add(model.toLowerCase());
    rows.push({
      brand,
      series: m.series.trim().slice(0, 120),
      model,
      years: m.years.trim().slice(0, 40),
      power_hp: m.power_hp && m.power_hp > 0 && m.power_hp < 2000 ? m.power_hp : null,
      source_url: m.source_url && /^https?:\/\//.test(m.source_url) ? m.source_url.slice(0, 500) : null,
      created_by: session.userId,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from('catalog_models').insert(rows);
    if (error) return { error: 'Enregistrement de la liste impossible.' };
  }
  await logAudit(session, 'catalogue.liste', undefined, { marque: brand, perimetre: scope, ajoutes: rows.length, trouves: list.models.length });
  revalidatePath('/admin/fiches/catalogue');
  const skipped = list.models.length - rows.length;
  return {
    ok: true,
    message: `${rows.length} modèle(s) ajouté(s) à la liste${skipped ? `, ${skipped} déjà présent(s)` : ''}.${list.note ? ` Remarque de Claude : ${list.note}` : ''}`,
  };
}

const idsSchema = z.array(z.string().uuid()).min(1, 'Cochez au moins un modèle').max(200);

/** Étape 2 : mettre des modèles en file (ou les retirer de la liste). */
export async function updateSelection(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/catalogue');
  const ids = idsSchema.safeParse(formData.getAll('ids'));
  if (!ids.success) return { error: ids.error.issues[0].message };
  const intent = formData.get('intent');
  const supabase = await createClient();

  if (intent === 'remove') {
    const { data } = await supabase.from('catalog_models').delete().in('id', ids.data).not('status', 'in', '(researching,writing)').select('id');
    await logAudit(session, 'catalogue.retrait', undefined, { nombre: data?.length ?? 0 });
    revalidatePath('/admin/fiches/catalogue');
    return { ok: true, message: `${data?.length ?? 0} modèle(s) retiré(s) de la liste.` };
  }

  const { data } = await supabase
    .from('catalog_models')
    .update({ status: 'queued', queued_at: new Date().toISOString(), attempts: 0, error: null, created_by: session.userId })
    .in('id', ids.data)
    .in('status', ['todo', 'error', 'done'])
    .select('id');
  const n = data?.length ?? 0;
  await logAudit(session, 'catalogue.mise_en_file', undefined, { nombre: n });
  // Réveille la file tout de suite plutôt que d'attendre la prochaine minute.
  if (n > 0) {
    try {
      await fetch(new URL('/api/catalogue/tick', env.siteUrl()), { method: 'POST', signal: AbortSignal.timeout(3000) });
    } catch {
      /* la tâche planifiée prendra le relais */
    }
  }
  revalidatePath('/admin/fiches/catalogue');
  return { ok: true, message: n ? `${n} fiche(s) en cours de préparation. Vous pouvez fermer cette page : le travail continue.` : 'Aucun modèle à générer dans la sélection.' };
}
