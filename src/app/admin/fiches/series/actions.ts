'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { parseSheetContent, type SheetContent } from '@/lib/sheets/schema';
import { notifySheetRequesters } from '@/lib/sheet-requests';
import type { FormState } from '@/components/form-bits';

/** Toutes les informations de la fiche sont marquées comme relues. */
function markAllReviewed(c: SheetContent): SheetContent {
  return {
    ...c,
    specs: c.specs.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, needs_review: false })) })),
    maintenance: c.maintenance.map((m) => ({ ...m, needs_review: false })),
    faults: c.faults.map((f) => ({ ...f, needs_review: false })),
    parts: c.parts.map((p) => ({ ...p, needs_review: false })),
  };
}

const idsSchema = z.array(z.string().uuid()).min(1, 'Cochez au moins une fiche.').max(60);

/**
 * Relecture par série : l'administrateur compare les modèles d'une même série
 * côte à côte, puis publie (ou rejette) les fiches cochées en une fois.
 * La publication vaut validation de chaque information de ces fiches.
 */
export async function reviewSeries(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireAdmin('/admin/fiches/series');
  const ids = idsSchema.safeParse(formData.getAll('fiche'));
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? 'Sélection invalide.' };
  const op = formData.get('op') === 'rejeter' ? 'rejeter' : 'publier';
  if (op === 'publier' && formData.get('atteste') !== 'on') {
    return { error: 'Cochez la case de confirmation : vous attestez avoir relu le tableau comparatif.' };
  }

  const supabase = await createClient();
  const { data } = await supabase.from('tech_sheets').select('id, title, status, content, published_at').in('id', ids.data);
  const sheets = (data ?? []).filter((s) => ['review', 'validated', 'published'].includes(s.status as string));
  if (!sheets.length) return { error: 'Aucune fiche de la sélection n’est à relire.' };

  const now = new Date().toISOString();
  let done = 0;
  for (const s of sheets) {
    if (op === 'rejeter') {
      const { error } = await supabase.from('tech_sheets').update({ status: 'rejected' }).eq('id', s.id);
      if (!error) {
        done++;
        await logAudit(session, 'fiche.rejetee', { type: 'tech_sheet', id: s.id as string }, { serie: true });
      }
      continue;
    }
    const content = markAllReviewed(parseSheetContent(s.content));
    const { error } = await supabase
      .from('tech_sheets')
      .update({ content, status: 'published', validated_by: session.userId, validated_at: now, published_at: (s.published_at as string | null) ?? now })
      .eq('id', s.id);
    if (!error) {
      done++;
      await logAudit(session, 'fiche.publiee', { type: 'tech_sheet', id: s.id as string }, { titre: s.title, serie: true });
      await notifySheetRequesters(s.id as string).catch((err) => console.error('[demandes de fiche]', err));
    }
  }

  revalidatePath('/fiches', 'layout');
  revalidatePath('/admin/fiches', 'layout');
  if (!done) return { error: 'Aucune fiche n’a pu être mise à jour.' };
  return {
    ok: true,
    message: op === 'rejeter' ? `${done} fiche${done > 1 ? 's' : ''} rejetée${done > 1 ? 's' : ''}.` : `${done} fiche${done > 1 ? 's' : ''} publiée${done > 1 ? 's' : ''} sur le site.`,
  };
}
