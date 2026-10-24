'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/components/form-bits';

const parcelSchema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom à la parcelle').max(80),
  crop: z.string().trim().max(80).default(''),
  area_ha: z.coerce.number({ error: 'Surface invalide' }).min(0, 'Surface invalide').max(99999),
});

export async function createParcel(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = parcelSchema.safeParse({
    name: formData.get('name'),
    crop: formData.get('crop') ?? '',
    area_ha: String(formData.get('area_ha') ?? '0').replace(',', '.'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from('parcels').insert(parsed.data);
  if (error) {
    if (error.code === 'P0001') return { error: 'Limite de 5 parcelles atteinte avec la formule gratuite. Passez à la formule Complet pour en ajouter.' };
    return { error: 'Impossible d’ajouter la parcelle.' };
  }
  revalidatePath('/app', 'layout');
  return { ok: true, message: `Parcelle « ${parsed.data.name} » ajoutée.` };
}

export async function deleteParcel(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  // La règle RLS garantit qu'on ne peut supprimer que ses propres parcelles.
  await supabase.from('parcels').delete().eq('id', id.data);
  revalidatePath('/app', 'layout');
}
