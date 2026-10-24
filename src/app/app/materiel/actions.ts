'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { COST_KINDS, MACHINE_KINDS } from '@/lib/types';
import { FREE_MACHINE_LIMIT } from '@/lib/plans';
import type { FormState } from '@/components/form-bits';

/* ------------------------------------------------------------------ */
/* Champs communs                                                      */
/* ------------------------------------------------------------------ */

const num = (opts: { min?: number; max?: number; label: string }) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= (opts.min ?? 0) && v <= (opts.max ?? 1e9)), `${opts.label} : valeur invalide`);
const required = (schema: ReturnType<typeof num>, label: string) => schema.refine((v) => v !== null, `${label} : obligatoire`).transform((v) => v as number);
const text = (max: number) => z.string().trim().max(max).default('');
const isoDate = z
  .string()
  .trim()
  .transform((v) => v || new Date().toISOString().slice(0, 10))
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), 'Date invalide (pas dans le futur)');
const uuid = z.string().uuid();
const get = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};

const LIMIT_MESSAGE = `La formule gratuite est limitée à ${FREE_MACHINE_LIMIT} machines. Passez à la formule Complet pour un parc illimité.`;

function refresh(machineId?: string) {
  revalidatePath('/app', 'layout');
  if (machineId) revalidatePath(`/app/materiel/${machineId}`);
}

/** Le compteur ne recule jamais : on relève et on avance la machine si besoin. */
async function bumpHours(machineId: string, hours: number, readOn: string) {
  const supabase = await createClient();
  const { data: machine } = await supabase.from('machines').select('hours').eq('id', machineId).single();
  if (!machine) return;
  if (hours > Number(machine.hours)) {
    await supabase.from('machines').update({ hours }).eq('id', machineId);
    await supabase.from('hour_readings').insert({ machine_id: machineId, hours, read_on: readOn });
  }
}

/* ------------------------------------------------------------------ */
/* Machines                                                            */
/* ------------------------------------------------------------------ */

const newMachineSchema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom à la machine').max(80),
  kind: z.enum(Object.keys(MACHINE_KINDS) as [keyof typeof MACHINE_KINDS, ...(keyof typeof MACHINE_KINDS)[]]),
  sheet_id: z.union([uuid, z.literal('')]).transform((v) => v || null),
  brand: text(60),
  model: text(80),
  year: num({ min: 1900, max: 2100, label: 'Année' }),
  hours: required(num({ max: 999_999, label: 'Compteur' }), 'Compteur'),
});

export async function addMachine(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const parsed = newMachineSchema.safeParse({
    name: get(formData, 'name'),
    kind: get(formData, 'kind') || 'tracteur',
    sheet_id: get(formData, 'sheet_id'),
    brand: get(formData, 'brand'),
    model: get(formData, 'model'),
    year: get(formData, 'year'),
    hours: get(formData, 'hours') || '0',
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.from('machines').insert(parsed.data).select('id').single();
  if (error || !data) return { error: error?.code === 'P0001' ? LIMIT_MESSAGE : 'Impossible d’ajouter la machine.' };
  // Premier relevé : point de départ du calcul des heures de travail.
  await supabase.from('hour_readings').insert({ machine_id: data.id, hours: parsed.data.hours });
  refresh();
  redirect(`/app/materiel/${data.id}?ajout=1`);
}

/** Depuis une fiche technique publique : « Ajouter à mon parc ». */
export async function addMachineFromSheet(formData: FormData) {
  await requireUser('/fiches');
  const sheetId = uuid.safeParse(formData.get('sheet_id'));
  if (!sheetId.success) redirect('/app/materiel');
  const supabase = await createClient();
  const { data: sheet } = await supabase.from('tech_sheets').select('id, title, brand, model').eq('id', sheetId.data).maybeSingle();
  if (!sheet) redirect('/app/materiel');

  const { data, error } = await supabase
    .from('machines')
    .insert({ name: sheet.title.slice(0, 80), sheet_id: sheet.id, brand: sheet.brand ?? '', model: sheet.model ?? '', hours: 0 })
    .select('id')
    .single();
  if (error || !data) redirect(error?.code === 'P0001' ? '/app/abonnement?raison=limite' : '/app/materiel');
  await supabase.from('hour_readings').insert({ machine_id: data.id, hours: 0 });
  refresh();
  redirect(`/app/materiel/${data.id}?ajout=1`);
}

const detailsSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, 'Donnez un nom à la machine').max(80),
  kind: newMachineSchema.shape.kind,
  sheet_id: newMachineSchema.shape.sheet_id,
  brand: text(60),
  model: text(80),
  year: num({ min: 1900, max: 2100, label: 'Année' }),
  serial_number: text(60),
  registration: text(20),
  purchase_date: z.string().trim().transform((v) => v || null).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date d’achat invalide'),
  purchase_price: num({ max: 10_000_000, label: 'Prix d’achat' }),
  resale_value: num({ max: 10_000_000, label: 'Valeur de revente' }),
  depreciation_years: required(num({ min: 1, max: 30, label: 'Durée d’amortissement' }), 'Durée d’amortissement'),
  interest_rate: num({ max: 30, label: 'Taux' }).transform((v) => v ?? 0),
  annual_hours_estimate: num({ min: 1, max: 8760, label: 'Heures par an' }),
  billing_rate: num({ max: 100_000, label: 'Tarif facturé' }),
  notes: text(2000),
});

export async function updateMachine(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const parsed = detailsSchema.safeParse({ depreciation_years: '7', ...raw });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  if (fields.resale_value !== null && fields.purchase_price !== null && fields.resale_value > fields.purchase_price) {
    return { error: 'La valeur de revente ne peut pas dépasser le prix d’achat.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('machines').update(fields).eq('id', id);
  if (error) return { error: 'Enregistrement impossible.' };
  refresh(id);
  return { ok: true, message: 'Informations enregistrées.' };
}

export async function deleteMachine(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const id = uuid.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Machine introuvable.' };
  if (get(formData, 'confirm').trim().toUpperCase() !== 'SUPPRIMER') return { error: 'Tapez SUPPRIMER pour confirmer.' };
  const supabase = await createClient();
  await supabase.from('machines').delete().eq('id', id.data);
  refresh();
  redirect('/app/materiel');
}

/* ------------------------------------------------------------------ */
/* Compteur                                                            */
/* ------------------------------------------------------------------ */

export async function recordHours(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const parsed = z
    .object({ machine_id: uuid, hours: required(num({ max: 999_999, label: 'Compteur' }), 'Compteur'), read_on: isoDate })
    .safeParse({ machine_id: get(formData, 'machine_id'), hours: get(formData, 'hours'), read_on: get(formData, 'read_on') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: machine } = await supabase.from('machines').select('hours').eq('id', parsed.data.machine_id).single();
  if (!machine) return { error: 'Machine introuvable.' };
  if (parsed.data.hours < Number(machine.hours)) {
    return { error: `Le compteur ne peut pas baisser (dernier relevé : ${Number(machine.hours).toLocaleString('fr-FR')} h).` };
  }
  const { error } = await supabase.from('hour_readings').insert(parsed.data);
  if (error) return { error: 'Relevé impossible.' };
  await supabase.from('machines').update({ hours: parsed.data.hours }).eq('id', parsed.data.machine_id);
  refresh(parsed.data.machine_id);
  return { ok: true, message: 'Compteur relevé.' };
}

/* ------------------------------------------------------------------ */
/* Entretien                                                           */
/* ------------------------------------------------------------------ */

export async function logMaintenance(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const parsed = z
    .object({
      machine_id: uuid,
      operation: z.string().trim().min(1, 'Indiquez l’opération').max(160),
      done_at_hours: required(num({ max: 999_999, label: 'Heures' }), 'Heures au compteur'),
      done_on: isoDate,
      cost: num({ max: 10_000_000, label: 'Coût' }),
      notes: text(1000),
    })
    .safeParse({
      machine_id: get(formData, 'machine_id'),
      operation: get(formData, 'operation_custom') || get(formData, 'operation'),
      done_at_hours: get(formData, 'done_at_hours'),
      done_on: get(formData, 'done_on'),
      cost: get(formData, 'cost'),
      notes: get(formData, 'notes'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { cost, ...log } = parsed.data;
  const supabase = await createClient();

  // Coût facultatif : enregistré dans les dépenses (catégorie entretien).
  let cost_id: string | null = null;
  if (cost && cost > 0) {
    const { data } = await supabase
      .from('machine_costs')
      .insert({ machine_id: log.machine_id, kind: 'entretien', label: log.operation, amount: cost, hours_at: log.done_at_hours, spent_on: log.done_on })
      .select('id')
      .single();
    cost_id = data?.id ?? null;
  }
  const { error } = await supabase.from('maintenance_logs').insert({ ...log, cost_id });
  if (error) return { error: 'Impossible d’enregistrer l’entretien.' };
  await bumpHours(log.machine_id, log.done_at_hours, log.done_on);
  refresh(log.machine_id);
  return { ok: true, message: 'Entretien noté.' };
}

export async function deleteLog(formData: FormData) {
  await requireUser('/app/materiel');
  const id = uuid.safeParse(formData.get('id'));
  const machineId = uuid.safeParse(formData.get('machine_id'));
  if (!id.success || !machineId.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from('maintenance_logs').delete().eq('id', id.data).select('cost_id').maybeSingle();
  if (data?.cost_id) await supabase.from('machine_costs').delete().eq('id', data.cost_id);
  refresh(machineId.data);
}

export async function addTask(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const parsed = z
    .object({
      machine_id: uuid,
      operation: z.string().trim().min(1, 'Indiquez l’opération').max(160),
      interval_hours: num({ min: 1, max: 100_000, label: 'Intervalle en heures' }),
      interval_months: num({ min: 1, max: 120, label: 'Intervalle en mois' }).transform((v) => (v === null ? null : Math.round(v))),
    })
    .refine((v) => v.interval_hours !== null || v.interval_months !== null, 'Indiquez un intervalle en heures ou en mois')
    .safeParse({
      machine_id: get(formData, 'machine_id'),
      operation: get(formData, 'operation'),
      interval_hours: get(formData, 'interval_hours'),
      interval_months: get(formData, 'interval_months'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from('machine_tasks').insert(parsed.data);
  if (error) return { error: 'Enregistrement impossible.' };
  refresh(parsed.data.machine_id);
  return { ok: true, message: 'Opération ajoutée au plan d’entretien.' };
}

export async function deleteTask(formData: FormData) {
  await requireUser('/app/materiel');
  const id = uuid.safeParse(formData.get('id'));
  const machineId = uuid.safeParse(formData.get('machine_id'));
  if (!id.success || !machineId.success) return;
  const supabase = await createClient();
  await supabase.from('machine_tasks').delete().eq('id', id.data);
  refresh(machineId.data);
}

/* ------------------------------------------------------------------ */
/* Dépenses                                                            */
/* ------------------------------------------------------------------ */

export async function addCost(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/app/materiel');
  const parsed = z
    .object({
      machine_id: uuid,
      kind: z.enum(Object.keys(COST_KINDS) as [keyof typeof COST_KINDS, ...(keyof typeof COST_KINDS)[]]),
      label: text(160),
      amount: required(num({ max: 10_000_000, label: 'Montant' }), 'Montant'),
      liters: num({ max: 1_000_000, label: 'Litres' }),
      hours_at: num({ max: 999_999, label: 'Compteur' }),
      spent_on: isoDate,
    })
    .safeParse({
      machine_id: get(formData, 'machine_id'),
      kind: get(formData, 'kind'),
      label: get(formData, 'label'),
      amount: get(formData, 'amount'),
      liters: get(formData, 'liters'),
      hours_at: get(formData, 'hours_at'),
      spent_on: get(formData, 'spent_on'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from('machine_costs').insert({ ...parsed.data, liters: parsed.data.kind === 'carburant' ? parsed.data.liters : null });
  if (error) return { error: 'Enregistrement impossible.' };
  if (parsed.data.hours_at) await bumpHours(parsed.data.machine_id, parsed.data.hours_at, parsed.data.spent_on);
  refresh(parsed.data.machine_id);
  return { ok: true, message: 'Dépense enregistrée.' };
}

export async function deleteCost(formData: FormData) {
  await requireUser('/app/materiel');
  const id = uuid.safeParse(formData.get('id'));
  const machineId = uuid.safeParse(formData.get('machine_id'));
  if (!id.success || !machineId.success) return;
  const supabase = await createClient();
  await supabase.from('maintenance_logs').update({ cost_id: null }).eq('cost_id', id.data);
  await supabase.from('machine_costs').delete().eq('id', id.data);
  refresh(machineId.data);
}
