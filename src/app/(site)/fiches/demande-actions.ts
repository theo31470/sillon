'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { OPEN_REQUESTS_LIMIT } from '@/lib/sheet-requests';
import type { FormState } from '@/components/form-bits';

const schema = z.object({
  brand: z.string().trim().min(1, 'Indiquez la marque.').max(60, 'Marque trop longue.'),
  model: z.string().trim().min(1, 'Indiquez le modèle.').max(120, 'Modèle trop long.'),
  details: z.string().trim().max(300, '300 caractères au maximum.'),
});

const clean = (v: string) => v.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();

/** Un membre demande la fiche d'un modèle absent : elle arrive dans l'admin, qui lance la préparation. */
export async function requestSheet(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireUser('/fiches#demande');
  if (!rateLimit(`demande-fiche:${session.userId}`, 10, 60 * 60_000).ok) return { error: 'Trop de demandes en peu de temps : réessayez dans une heure.' };
  const parsed = schema.safeParse({ brand: formData.get('brand') ?? '', model: formData.get('model') ?? '', details: formData.get('details') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Demande incomplète.' };
  const { brand, model, details } = parsed.data;
  const db = createServiceClient();

  // Déjà en ligne ?
  const { data: existing } = await db
    .from('tech_sheets')
    .select('title, slug')
    .eq('status', 'published')
    .ilike('brand', clean(brand))
    .ilike('model', clean(model))
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, message: `Bonne nouvelle : la fiche « ${existing.title} » est déjà en ligne. Cherchez-la dans la liste ci-dessus.` };

  const { count } = await db.from('sheet_requests').select('id', { count: 'exact', head: true }).eq('user_id', session.userId).in('status', ['nouvelle', 'lancee']);
  if ((count ?? 0) >= OPEN_REQUESTS_LIMIT) return { error: `Vous avez déjà ${OPEN_REQUESTS_LIMIT} demandes en cours : nous vous prévenons dès qu’elles sont prêtes.` };

  // Modèle déjà dans le catalogue d'import (fiche en préparation ou en relecture) : la demande suit son cours.
  const { data: known } = await db.from('catalog_models').select('id, status, sheet_id').ilike('brand', clean(brand)).ilike('model', clean(model)).limit(1).maybeSingle();
  const inProgress = Boolean(known && known.status !== 'error');

  const { error } = await db.from('sheet_requests').insert({
    user_id: session.userId,
    brand,
    model,
    details,
    status: inProgress ? 'lancee' : 'nouvelle',
    catalog_model_id: known?.id ?? null,
  });
  if (error?.code === '23505') return { error: 'Vous avez déjà demandé ce modèle : nous vous prévenons dès que sa fiche est en ligne.' };
  if (error) return { error: 'Envoi impossible pour le moment. Réessayez dans un instant.' };
  revalidatePath('/fiches');
  return { ok: true, message: `Demande enregistrée pour le ${brand} ${model}. Nous préparons la fiche et vous prévenons par e-mail dès qu’elle est en ligne.` };
}
