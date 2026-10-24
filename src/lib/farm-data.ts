import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { computeMaintenance, type MaintenanceDue } from '@/lib/maintenance';
import type { Intervention, Machine, MaintenanceLog, Parcel, TechSheet } from '@/lib/types';

/** Données de l'exploitant connecté (les règles RLS limitent tout à ses propres lignes). */

export async function getParcels() {
  const supabase = await createClient();
  const { data } = await supabase.from('parcels').select('*').order('name');
  return (data ?? []) as Parcel[];
}

export async function getInterventions(opts: { limit?: number; from?: string; to?: string; parcelId?: string } = {}) {
  const supabase = await createClient();
  let query = supabase.from('interventions').select('*').order('done_on', { ascending: false }).order('created_at', { ascending: false });
  if (opts.from) query = query.gte('done_on', opts.from);
  if (opts.to) query = query.lte('done_on', opts.to);
  if (opts.parcelId) query = query.eq('parcel_id', opts.parcelId);
  if (opts.limit) query = query.limit(opts.limit);
  const { data } = await query;
  return (data ?? []) as Intervention[];
}

export type MachineWithStatus = Machine & {
  sheet: Pick<TechSheet, 'id' | 'slug' | 'title'> | null;
  due: MaintenanceDue[];
  logs: MaintenanceLog[];
};

export async function getMachinesWithMaintenance(): Promise<MachineWithStatus[]> {
  const supabase = await createClient();
  const { data: machines } = await supabase.from('machines').select('*').order('name');
  const list = (machines ?? []) as Machine[];
  if (list.length === 0) return [];

  const sheetIds = [...new Set(list.map((m) => m.sheet_id).filter(Boolean))] as string[];
  const [{ data: sheets }, { data: logs }] = await Promise.all([
    sheetIds.length
      ? supabase.from('tech_sheets').select('id, slug, title, content').in('id', sheetIds)
      : Promise.resolve({ data: [] as Pick<TechSheet, 'id' | 'slug' | 'title' | 'content'>[] }),
    supabase.from('maintenance_logs').select('*').order('done_on', { ascending: false }),
  ]);
  const sheetMap = new Map((sheets ?? []).map((s) => [s.id, s]));
  const allLogs = (logs ?? []) as MaintenanceLog[];

  return list.map((m) => {
    const sheet = m.sheet_id ? sheetMap.get(m.sheet_id) ?? null : null;
    const machineLogs = allLogs.filter((l) => l.machine_id === m.id);
    return {
      ...m,
      sheet: sheet ? { id: sheet.id, slug: sheet.slug, title: sheet.title } : null,
      due: sheet ? computeMaintenance(m, sheet.content, machineLogs) : [],
      logs: machineLogs,
    };
  });
}
