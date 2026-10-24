import { parseSheetContent } from '@/lib/sheets/schema';
import type { Machine, MaintenanceLog } from '@/lib/types';

export type MaintenanceDue = {
  machineId: string;
  machineName: string;
  operation: string;
  intervalHours: number;
  dueAtHours: number;
  remainingHours: number;
};

/**
 * Calcule les prochains entretiens d'une machine à partir du plan d'entretien
 * de sa fiche technique et des entretiens déjà notés.
 */
export function computeMaintenance(
  machine: Machine,
  sheetContent: unknown,
  logs: MaintenanceLog[],
): MaintenanceDue[] {
  const content = parseSheetContent(sheetContent);
  return content.maintenance
    .filter((m) => m.interval_hours && m.interval_hours > 0)
    .map((m) => {
      const interval = m.interval_hours as number;
      const last = logs
        .filter((l) => l.machine_id === machine.id && l.operation === m.operation)
        .reduce((max, l) => Math.max(max, Number(l.done_at_hours)), -1);
      // Jamais fait : prochaine échéance au prochain multiple de l'intervalle.
      const dueAt = last >= 0 ? last + interval : Math.max(interval, Math.ceil(Number(machine.hours) / interval) * interval);
      return {
        machineId: machine.id,
        machineName: machine.name,
        operation: m.operation,
        intervalHours: interval,
        dueAtHours: dueAt,
        remainingHours: Math.round((dueAt - Number(machine.hours)) * 10) / 10,
      };
    })
    .sort((a, b) => a.remainingHours - b.remainingHours);
}
