'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { INTERVENTION_KINDS } from '@/lib/types';
import type { FormState } from '@/components/form-bits';

const interventionSchema = z
  .object({
    parcel_id: z.string().uuid('Choisissez une parcelle'),
    done_on: z.iso.date('Date invalide'),
    kind: z.enum(Object.keys(INTERVENTION_KINDS) as [keyof typeof INTERVENTION_KINDS, ...(keyof typeof INTERVENTION_KINDS)[]]),
    product: z.string().trim().max(120).default(''),
    dose: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Dose invalide'),
    dose_unit: z.string().trim().max(20).default(''),
    target: z.string().trim().max(120).default(''),
    operator: z.string().trim().max(80).default(''),
    notes: z.string().trim().max(1000).default(''),
  })
  .refine((v) => new Date(v.done_on) <= new Date(Date.now() + 86_400_000), { message: 'La date ne peut pas être dans le futur', path: ['done_on'] });

export async function createIntervention(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = interventionSchema.safeParse({ ...raw, dose: raw.dose ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from('interventions').insert(parsed.data);
  if (error) return { error: 'Impossible d’enregistrer l’intervention.' };

  revalidatePath('/app', 'layout');
  const incomplete = parsed.data.kind === 'traitement' && (!parsed.data.product || parsed.data.dose === null);
  return {
    ok: true,
    message: incomplete
      ? 'Intervention enregistrée. Pensez à compléter le produit et la dose pour le registre.'
      : 'Intervention enregistrée dans le registre.',
  };
}

export async function deleteIntervention(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('interventions').delete().eq('id', id.data);
  revalidatePath('/app', 'layout');
}
