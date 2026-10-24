import { parseSheetContent, type InfoOrigin } from '@/lib/sheets/schema';
import type { Machine, MachineTask, MaintenanceLog } from '@/lib/types';

/**
 * Échéances d'entretien d'une machine.
 * Plan = opérations de la fiche technique (avec intervalle) + plan personnalisé
 * de l'exploitant (qui remplace l'opération de même nom). Chaque échéance tombe
 * au premier des deux termes atteint : heures ou mois.
 */

export type PlanItem = {
  operation: string;
  intervalHours: number | null;
  intervalMonths: number | null;
  source: 'fiche' | 'perso';
  origin?: InfoOrigin;
  taskId?: string;
};

export type DueStatus = 'retard' | 'bientot' | 'ok';

export type MaintenanceDue = PlanItem & {
  lastDoneHours: number | null;
  lastDoneOn: string | null;
  dueAtHours: number | null;
  dueOn: string | null;
  remainingHours: number | null;
  remainingDays: number | null;
  status: DueStatus;
  /** 0 = à faire maintenant, 1 = vient d'être fait (pour trier et dessiner la jauge). */
  progress: number;
};

const norm = (s: string) => s.trim().toLowerCase();

export function maintenancePlan(sheetContent: unknown, tasks: MachineTask[]): PlanItem[] {
  const plan = new Map<string, PlanItem>();
  if (sheetContent) {
    for (const m of parseSheetContent(sheetContent).maintenance) {
      if (!m.interval_hours && !m.interval_months) continue;
      plan.set(norm(m.operation), {
        operation: m.operation,
        intervalHours: m.interval_hours,
        intervalMonths: m.interval_months,
        source: 'fiche',
        origin: m.origin,
      });
    }
  }
  for (const t of tasks) {
    plan.set(norm(t.operation), {
      operation: t.operation,
      intervalHours: t.interval_hours === null ? null : Number(t.interval_hours),
      intervalMonths: t.interval_months,
      source: 'perso',
      taskId: t.id,
    });
  }
  return [...plan.values()];
}

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

export function computeMaintenance(
  machine: Pick<Machine, 'hours' | 'created_at'>,
  plan: PlanItem[],
  logs: MaintenanceLog[],
  today = new Date().toISOString().slice(0, 10),
): MaintenanceDue[] {
  const hoursNow = Number(machine.hours);
  // Opération jamais notée : on ne connaît pas l'historique, on compte à partir
  // de l'ajout de la machine dans Sillon.
  const startDate = machine.created_at.slice(0, 10);

  return plan
    .map((item) => {
      const done = logs
        .filter((l) => norm(l.operation) === norm(item.operation))
        .sort((a, b) => Number(b.done_at_hours) - Number(a.done_at_hours) || b.done_on.localeCompare(a.done_on))[0];
      const lastDoneHours = done ? Number(done.done_at_hours) : null;
      const lastDoneOn = done ? done.done_on : null;

      let dueAtHours: number | null = null;
      let remainingHours: number | null = null;
      let hoursProgress = 1;
      if (item.intervalHours) {
        const ih = item.intervalHours;
        // Jamais noté : au prochain multiple de l'intervalle (au-delà du compteur actuel).
        dueAtHours = lastDoneHours !== null ? lastDoneHours + ih : (Math.floor(hoursNow / ih) + 1) * ih;
        remainingHours = Math.round((dueAtHours - hoursNow) * 10) / 10;
        hoursProgress = Math.max(0, Math.min(1, remainingHours / ih));
      }

      let dueOn: string | null = null;
      let remainingDays: number | null = null;
      let daysProgress = 1;
      if (item.intervalMonths) {
        dueOn = addMonths(lastDoneOn ?? startDate, item.intervalMonths);
        remainingDays = daysBetween(today, dueOn);
        daysProgress = Math.max(0, Math.min(1, remainingDays / (item.intervalMonths * 30.4)));
      }

      const overdue = (remainingHours !== null && remainingHours <= 0) || (remainingDays !== null && remainingDays <= 0);
      const soon =
        (remainingHours !== null && remainingHours <= Math.max(25, (item.intervalHours ?? 0) * 0.1)) ||
        (remainingDays !== null && remainingDays <= 30);
      return {
        ...item,
        lastDoneHours,
        lastDoneOn,
        dueAtHours,
        dueOn,
        remainingHours,
        remainingDays,
        status: overdue ? 'retard' : soon ? 'bientot' : 'ok',
        progress: Math.min(hoursProgress, daysProgress),
      } satisfies MaintenanceDue;
    })
    .sort((a, b) => a.progress - b.progress);
}

/** Libellé court d'une échéance : « dans 42 h », « en retard de 3 jours »… */
export function dueLabel(d: Pick<MaintenanceDue, 'remainingHours' | 'remainingDays'>) {
  const fmt = (n: number) => Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const parts: string[] = [];
  const late = (d.remainingHours !== null && d.remainingHours <= 0) || (d.remainingDays !== null && d.remainingDays <= 0);
  if (late) {
    if (d.remainingHours !== null && d.remainingHours <= 0) parts.push(`${fmt(d.remainingHours)} h`);
    if (d.remainingDays !== null && d.remainingDays <= 0) parts.push(`${fmt(d.remainingDays)} jours`);
    return `en retard de ${parts.join(' / ')}`;
  }
  if (d.remainingHours !== null) parts.push(`${fmt(d.remainingHours)} h`);
  if (d.remainingDays !== null) parts.push(d.remainingDays > 60 ? `${Math.round(d.remainingDays / 30.4)} mois` : `${d.remainingDays} jours`);
  return `dans ${parts.join(' ou ')}`;
}
