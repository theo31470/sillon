'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { invoiceQuota, readWorkshopInvoice, type InvoiceReading } from '@/lib/invoice-reader';
import { maintenancePlan } from '@/lib/maintenance';
import { alertAdmins, isAiBillingError } from '@/lib/email/alerts';
import type { MachineTask } from '@/lib/types';

export type ReadResult = { ok: InvoiceReading; remaining: number } | { error: string };

const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
// Photo réduite dans le navigateur ; PDF tel quel : 4 Mo au plus (limite d’envoi des actions : 6 Mo).
const MAX_BASE64 = 5_600_000;

/** Étape 1 : Claude lit la facture. Rien n'est enregistré à ce stade. */
export async function readInvoice(input: { machineId: string; base64: string; mime: string }): Promise<ReadResult> {
  const { session, profile } = await requireUser('/app/materiel');
  if (profile.plan === 'free') return { error: 'La lecture des factures est incluse dans la formule Complet.' };
  const parsed = z
    .object({ machineId: z.string().uuid(), base64: z.string().min(100).max(MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/), mime: z.enum(MIMES) })
    .safeParse(input);
  if (!parsed.success) return { error: 'Fichier non pris en charge : envoyez une photo (JPEG, PNG) ou un PDF de moins de 4 Mo.' };
  if (!rateLimit(`facture:${session.userId}`, 5, 60_000).ok) return { error: 'Un instant : attendez une minute avant d’envoyer une autre facture.' };
  const quota = await invoiceQuota(session.userId);
  if (quota.remaining <= 0) return { error: `Vous avez lu vos ${quota.limit} factures du mois. Le compteur repart à zéro le 1er du mois prochain.` };

  const supabase = await createClient();
  const { data: machine } = await supabase.from('machines').select('id, user_id, name, brand, model, sheet_id').eq('id', parsed.data.machineId).maybeSingle();
  if (!machine || machine.user_id !== session.userId) return { error: 'Machine introuvable.' };
  const [{ data: sheet }, { data: tasks }] = await Promise.all([
    machine.sheet_id ? supabase.from('tech_sheets').select('content').eq('id', machine.sheet_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('machine_tasks').select('*').eq('machine_id', machine.id),
  ]);
  const plan = maintenancePlan(sheet?.content ?? null, (tasks ?? []) as MachineTask[]).map((p) => p.operation);

  try {
    const reading = await readWorkshopInvoice({
      userId: session.userId,
      base64: parsed.data.base64,
      mime: parsed.data.mime,
      machineName: [machine.name, machine.brand, machine.model].filter(Boolean).join(' · '),
      planOperations: plan,
    });
    if (!reading.is_invoice) return { error: 'Ce document ne ressemble pas à une facture d’atelier. Reprenez la photo bien à plat, en entier et éclairée.' };
    return { ok: reading, remaining: quota.remaining - 1 };
  } catch (err) {
    console.error('[facture]', err);
    if (isAiBillingError(err)) {
      await alertAdmins('credits-ia', 'Plus de crédit Claude : la lecture des factures est en panne', ['L’API Claude refuse les demandes : le crédit du compte est épuisé.'], 'https://console.anthropic.com/settings/billing');
    }
    return { error: 'La facture n’a pas pu être lue pour le moment. Réessayez dans un instant, ou notez l’entretien à la main.' };
  }
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Étape 2 : après relecture, les opérations cochées entrent dans le carnet et le montant dans les dépenses. */
export async function saveInvoice(_prev: { ok?: boolean; error?: string; message?: string } | undefined, formData: FormData) {
  const { session } = await requireUser('/app/materiel');
  const machineId = z.string().uuid().safeParse(formData.get('machine_id'));
  if (!machineId.success) return { error: 'Machine introuvable.' };
  const supabase = await createClient();
  const { data: machine } = await supabase.from('machines').select('id, user_id, hours').eq('id', machineId.data).maybeSingle();
  if (!machine || machine.user_id !== session.userId) return { error: 'Machine introuvable.' };

  const date = String(formData.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) return { error: 'Indiquez la date de l’intervention.' };
  const hours = num(formData.get('hours'));
  if (Number.isNaN(hours) || (hours !== null && hours > 999_999)) return { error: 'Compteur invalide.' };
  const amount = num(formData.get('amount'));
  if (Number.isNaN(amount) || (amount !== null && amount > 10_000_000)) return { error: 'Montant invalide.' };
  const kind = z.enum(['entretien', 'reparation', 'pneumatiques', 'autre']).catch('entretien').parse(formData.get('kind'));
  const garage = String(formData.get('garage') ?? '').trim().slice(0, 80);
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 900);
  const operations = formData
    .getAll('operation')
    .map((o) => String(o).trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);
  if (!operations.length && !amount) return { error: 'Cochez au moins une opération, ou indiquez un montant.' };

  const doneAt = hours ?? Number(machine.hours);
  let costId: string | null = null;
  if (amount && amount > 0) {
    const { data: cost, error } = await supabase
      .from('machine_costs')
      .insert({ machine_id: machine.id, kind, label: `Facture${garage ? ` ${garage}` : ''}`.slice(0, 160), amount, hours_at: hours, spent_on: date })
      .select('id')
      .single();
    if (error) return { error: 'Enregistrement de la dépense impossible.' };
    costId = cost.id as string;
  }
  if (operations.length) {
    const note = [garage ? `Facture ${garage}` : 'Facture d’atelier', notes].filter(Boolean).join(' · ').slice(0, 1000);
    const { error } = await supabase
      .from('maintenance_logs')
      .insert(operations.map((operation, i) => ({ machine_id: machine.id, operation, done_at_hours: doneAt, done_on: date, notes: note, cost_id: i === 0 ? costId : null })));
    if (error) return { error: 'Enregistrement des entretiens impossible.' };
  }
  // Le compteur de la facture fait avancer celui de la machine (jamais reculer).
  if (hours !== null && hours > Number(machine.hours)) await supabase.from('hour_readings').insert({ machine_id: machine.id, hours, read_on: date });

  revalidatePath('/app', 'layout');
  revalidatePath(`/app/materiel/${machine.id}`);
  const parts = [operations.length ? `${operations.length} entretien${operations.length > 1 ? 's' : ''} noté${operations.length > 1 ? 's' : ''}` : '', costId ? 'dépense ajoutée' : ''].filter(Boolean);
  return { ok: true, message: `Facture enregistrée : ${parts.join(', ')}.` };
}
