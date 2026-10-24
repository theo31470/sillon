import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { computeMaintenance, maintenancePlan, type MaintenanceDue } from '@/lib/maintenance';
import { computeCosts, type CostBreakdown } from '@/lib/costs';
import { machineKind, type MachineKind } from '@/lib/sheets/insights';
import type { HourReading, Machine, MachineCost, MachineTask, MaintenanceLog, TechSheet } from '@/lib/types';

/**
 * Parc matériel de l'exploitant connecté. Les règles RLS limitent toutes les
 * lectures à ses propres lignes.
 */

export type FleetMachine = Machine & {
  sheet: Pick<TechSheet, 'id' | 'slug' | 'title' | 'cover_url'> | null;
  art: MachineKind;
  due: MaintenanceDue[];
  logs: MaintenanceLog[];
  tasks: MachineTask[];
  readings: HourReading[];
  costs: MachineCost[];
  economics: CostBreakdown;
};

const ART_BY_KIND: Record<Machine['kind'], MachineKind> = {
  tracteur: 'tracteur',
  telescopique: 'tracteur',
  moissonneuse: 'moissonneuse',
  automoteur: 'moissonneuse',
  pulverisateur: 'pulverisateur',
  outil: 'outil',
  autre: 'outil',
};

async function load(machineId?: string): Promise<FleetMachine[]> {
  const supabase = await createClient();
  let mq = supabase.from('machines').select('*').order('name');
  if (machineId) mq = mq.eq('id', machineId);
  const { data: machines } = await mq;
  const list = (machines ?? []) as Machine[];
  if (list.length === 0) return [];
  const ids = list.map((m) => m.id);
  const since = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString().slice(0, 10);

  const sheetIds = [...new Set(list.map((m) => m.sheet_id).filter(Boolean))] as string[];
  const [sheets, logs, tasks, readings, costs] = await Promise.all([
    sheetIds.length
      ? supabase.from('tech_sheets').select('id, slug, title, cover_url, content').in('id', sheetIds)
      : Promise.resolve({ data: [] as (Pick<TechSheet, 'id' | 'slug' | 'title' | 'cover_url' | 'content'>)[] }),
    supabase.from('maintenance_logs').select('*').in('machine_id', ids).order('done_on', { ascending: false }),
    supabase.from('machine_tasks').select('*').in('machine_id', ids).order('operation'),
    // Le détail d'une machine charge tout l'historique ; le tableau de bord, les 2 dernières années.
    machineId
      ? supabase.from('hour_readings').select('*').in('machine_id', ids).order('read_on', { ascending: false })
      : supabase.from('hour_readings').select('*').in('machine_id', ids).gte('read_on', since).order('read_on', { ascending: false }),
    machineId
      ? supabase.from('machine_costs').select('*').in('machine_id', ids).order('spent_on', { ascending: false })
      : supabase.from('machine_costs').select('*').in('machine_id', ids).gte('spent_on', since).order('spent_on', { ascending: false }),
  ]);
  const sheetMap = new Map((sheets.data ?? []).map((s) => [s.id, s]));
  const by = <T extends { machine_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((r) => r.machine_id === id);

  return list.map((m) => {
    const sheet = m.sheet_id ? sheetMap.get(m.sheet_id) ?? null : null;
    const machineLogs = by(logs.data as MaintenanceLog[] | null, m.id);
    const machineTasks = by(tasks.data as MachineTask[] | null, m.id);
    const machineReadings = by(readings.data as HourReading[] | null, m.id);
    const machineCosts = by(costs.data as MachineCost[] | null, m.id);
    return {
      ...m,
      sheet: sheet ? { id: sheet.id, slug: sheet.slug, title: sheet.title, cover_url: sheet.cover_url } : null,
      art: sheet ? machineKind({ title: sheet.title, category: 'machine' }) : ART_BY_KIND[m.kind] ?? 'tracteur',
      due: computeMaintenance(m, maintenancePlan(sheet?.content ?? null, machineTasks), machineLogs),
      logs: machineLogs,
      tasks: machineTasks,
      readings: machineReadings,
      costs: machineCosts,
      economics: computeCosts(m, machineCosts, machineReadings),
    };
  });
}

export async function getFleet() {
  return load();
}

export async function getMachine(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await load(id))[0] ?? null;
}

/** Nombre de jours depuis le dernier relevé de compteur (ou l'ajout de la machine). */
export function daysSinceReading(m: Pick<FleetMachine, 'readings' | 'created_at'>) {
  const last = m.readings.reduce((max, r) => (r.read_on > max ? r.read_on : max), m.created_at.slice(0, 10));
  return Math.floor((Date.now() - Date.parse(`${last}T12:00:00Z`)) / 86_400_000);
}
