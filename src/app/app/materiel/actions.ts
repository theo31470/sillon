'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/components/form-bits';

const PAID_ONLY = 'Le suivi du matériel est inclus dans la formule Complet.';

const hours = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(',', '.')))
  .refine((v) => Number.isFinite(v) && v >= 0 && v < 1_000_000, 'Nombre d’heures invalide');

export async function addMachine(_prev: FormState, formData: FormData): Promise<FormState> {
  const { profile } = await requireUser();
  if (profile.plan === 'free') return { error: PAID_ONLY };

  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Donnez un nom à la machine').max(80),
      sheet_id: z.union([z.string().uuid(), z.literal('')]).transform((v) => v || null),
      hours,
    })
    .safeParse({ name: formData.get('name'), sheet_id: formData.get('sheet_id') ?? '', hours: formData.get('hours') ?? '0' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from('machines').insert(parsed.data);
  if (error) return { error: 'Impossible d’ajouter la machine.' };
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'Machine ajoutée.' };
}

/** Depuis une fiche technique publique : « Ajouter à mon matériel ». */
export async function addMachineFromSheet(formData: FormData) {
  const { profile } = await requireUser('/fiches');
  if (profile.plan === 'free') redirect('/app/abonnement?raison=materiel');
  const sheetId = z.string().uuid().safeParse(formData.get('sheet_id'));
  const name = z.string().trim().min(1).max(80).safeParse(formData.get('name'));
  if (!sheetId.success || !name.success) redirect('/app/materiel');

  const supabase = await createClient();
  await supabase.from('machines').insert({ name: name.data, sheet_id: sheetId.data, hours: 0 });
  revalidatePath('/app', 'layout');
  redirect('/app/materiel?ajout=1');
}

export async function updateHours(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z.object({ id: z.string().uuid(), hours }).safeParse({ id: formData.get('id'), hours: formData.get('hours') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: machine } = await supabase.from('machines').select('hours').eq('id', parsed.data.id).single();
  if (!machine) return { error: 'Machine introuvable.' };
  if (parsed.data.hours < Number(machine.hours)) {
    return { error: `Le compteur ne peut pas baisser (actuellement ${machine.hours} h).` };
  }
  const { error } = await supabase.from('machines').update({ hours: parsed.data.hours }).eq('id', parsed.data.id);
  if (error) return { error: 'Mise à jour impossible.' };
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'Compteur mis à jour.' };
}

export async function logMaintenance(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = z
    .object({
      machine_id: z.string().uuid(),
      operation: z.string().trim().min(1, 'Indiquez l’opération').max(160),
      done_at_hours: hours,
      notes: z.string().trim().max(1000).default(''),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from('maintenance_logs').insert(parsed.data);
  if (error) return { error: 'Impossible d’enregistrer l’entretien.' };
  // Le compteur avance si l'entretien a été fait à un nombre d'heures supérieur.
  const { data: machine } = await supabase.from('machines').select('hours').eq('id', parsed.data.machine_id).single();
  if (machine && parsed.data.done_at_hours > Number(machine.hours)) {
    await supabase.from('machines').update({ hours: parsed.data.done_at_hours }).eq('id', parsed.data.machine_id);
  }
  revalidatePath('/app', 'layout');
  return { ok: true, message: 'Entretien noté.' };
}

export async function deleteMachine(formData: FormData) {
  await requireUser();
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('machines').delete().eq('id', id.data);
  revalidatePath('/app', 'layout');
}
