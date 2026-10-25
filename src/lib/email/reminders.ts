import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { computeMaintenance, dueLabel, maintenancePlan } from '@/lib/maintenance';
import { reminderEmail } from '@/lib/email/templates';
import { emailSettings, preferencesUrl, sendMany, type OutgoingEmail } from '@/lib/email/send';
import type { DueRow } from '@/lib/email/layout';
import type { Machine, MachineTask, MaintenanceLog } from '@/lib/types';

/**
 * Tournée quotidienne des rappels d'entretien.
 *
 * Pour chaque membre qui a gardé les rappels activés, on recalcule les
 * échéances de toutes ses machines. Dès qu'une échéance passe « bientôt »
 * ou « en retard » pour la première fois, le membre reçoit UN e-mail qui
 * récapitule tout ce qui l'attend. Chaque échéance n'est signalée qu'une
 * fois par niveau (table maintenance_reminders).
 */

export const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

type Member = { id: string; email: string; full_name: string; email_token: string };
type Pending = { machine_id: string; operation_key: string; due_key: string; level: 'bientot' | 'retard' };

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export type ReminderRun = { skipped?: string; members: number; emails: number; failed: number };

export async function runReminders(opts: { force?: boolean; today?: string } = {}): Promise<ReminderRun> {
  if (!emailSettings().apiKeySet) return { skipped: 'Service d’envoi non configuré.', members: 0, emails: 0, failed: 0 };
  const db = createServiceClient();
  const today = opts.today ?? parisToday();

  // Une seule tournée par jour (sauf lancement manuel depuis l'admin).
  if (!opts.force) {
    const { error } = await db.from('reminder_runs').insert({ day: today });
    if (error?.code === '23505') return { skipped: 'Tournée du jour déjà faite.', members: 0, emails: 0, failed: 0 };
    if (error) throw new Error(error.message);
  }

  let members = 0;
  let emails = 0;
  let failed = 0;
  const site = env.siteUrl();

  for (let from = 0; ; from += 100) {
    const { data: page, error } = await db
      .from('profiles')
      .select('id, email, full_name, email_token')
      .eq('email_reminders', true)
      .eq('suspended', false)
      .neq('email', '')
      .order('created_at')
      .range(from, from + 99);
    if (error) throw new Error(error.message);
    const list = (page ?? []) as Member[];
    if (!list.length) break;
    members += list.length;

    const { data: machineRows } = await db.from('machines').select('*').in('user_id', list.map((m) => m.id));
    const machines = (machineRows ?? []) as Machine[];
    if (!machines.length) {
      if (list.length < 100) break;
      continue;
    }

    const ids = machines.map((m) => m.id);
    const sheetIds = [...new Set(machines.map((m) => m.sheet_id).filter(Boolean))] as string[];
    const logs: MaintenanceLog[] = [];
    const tasks: MachineTask[] = [];
    const sent = new Set<string>();
    for (const part of chunks(ids, 100)) {
      const [l, t, s] = await Promise.all([
        db.from('maintenance_logs').select('*').in('machine_id', part),
        db.from('machine_tasks').select('*').in('machine_id', part),
        db.from('maintenance_reminders').select('machine_id, operation_key, due_key, level').in('machine_id', part),
      ]);
      logs.push(...((l.data ?? []) as MaintenanceLog[]));
      tasks.push(...((t.data ?? []) as MachineTask[]));
      for (const r of (s.data ?? []) as Pending[]) sent.add(`${r.machine_id}|${r.operation_key}|${r.due_key}|${r.level}`);
    }
    const sheets = new Map<string, unknown>();
    for (const part of chunks(sheetIds, 100)) {
      const { data } = await db.from('tech_sheets').select('id, content').in('id', part);
      for (const s of data ?? []) sheets.set(s.id as string, s.content);
    }

    const outgoing: OutgoingEmail[] = [];
    const freshByEmail: Pending[][] = [];
    for (const member of list) {
      const rows: DueRow[] = [];
      const fresh: Pending[] = [];
      for (const m of machines.filter((x) => x.user_id === member.id)) {
        const plan = maintenancePlan(m.sheet_id ? sheets.get(m.sheet_id) ?? null : null, tasks.filter((t) => t.machine_id === m.id));
        const due = computeMaintenance(m, plan, logs.filter((l) => l.machine_id === m.id), today);
        for (const d of due) {
          if (d.status === 'ok') continue;
          const p: Pending = {
            machine_id: m.id,
            operation_key: d.operation.trim().toLowerCase().slice(0, 200),
            due_key: `${d.dueAtHours ?? ''}|${d.dueOn ?? ''}`,
            level: d.status,
          };
          rows.push({ machine: m.name, operation: d.operation, when: dueLabel(d), level: d.status });
          if (!sent.has(`${p.machine_id}|${p.operation_key}|${p.due_key}|${p.level}`)) fresh.push(p);
        }
      }
      // Rien de nouveau depuis le dernier rappel : on ne relance pas.
      if (!fresh.length) continue;
      rows.sort((a, b) => (a.level === b.level ? 0 : a.level === 'retard' ? -1 : 1));
      outgoing.push({
        to: member.email,
        email: reminderEmail({ name: member.full_name, rows: rows.slice(0, 25), preferencesUrl: preferencesUrl(member.email_token) }, site),
        kind: 'rappel',
        template: 'rappel_entretien',
        userId: member.id,
        unsubscribe: { token: member.email_token, list: 'rappels' },
      });
      freshByEmail.push(fresh);
    }

    if (outgoing.length) {
      const r = await sendMany(outgoing, { idempotencyPrefix: `rappels-${today}-${from}${opts.force ? `-${Date.now()}` : ''}` });
      emails += r.sent;
      failed += r.failed;
      // On ne marque comme « prévenues » que les échéances d'un envoi réussi.
      const toRecord = freshByEmail.flatMap((f, i) => (r.results[i]?.ok ? f : []));
      if (toRecord.length) {
        for (const part of chunks(toRecord, 500)) {
          await db.from('maintenance_reminders').upsert(part, { onConflict: 'machine_id,operation_key,due_key,level', ignoreDuplicates: true });
        }
      }
    }
    if (list.length < 100) break;
  }

  await db.from('reminder_runs').upsert({ day: today, finished_at: new Date().toISOString(), users_checked: members, emails_sent: emails }, { onConflict: 'day' });
  return { members, emails, failed };
}
