import 'server-only';
import { createServiceClient } from '@/lib/supabase/admin';
import { MAINTENANCE_OFF, parseMaintenance, type MaintenanceState } from '@/lib/maintenance-mode';

export async function getMaintenance(): Promise<MaintenanceState> {
  try {
    const { data } = await createServiceClient().from('site_settings').select('value').eq('key', 'maintenance').maybeSingle();
    return data ? parseMaintenance(data.value) : MAINTENANCE_OFF;
  } catch {
    return MAINTENANCE_OFF;
  }
}

export async function setMaintenance(state: MaintenanceState, userId: string) {
  const { error } = await createServiceClient()
    .from('site_settings')
    .upsert({ key: 'maintenance', value: state, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** « 2026-11-01T14:30 » saisi en heure de Paris → date ISO (UTC). */
export function parisLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = new Date(`${local}:00Z`);
  // Décalage de Paris à cette date (heure d'été ou d'hiver).
  const paris = new Date(asUtc.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const utc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(asUtc.getTime() - (paris.getTime() - utc.getTime())).toISOString();
}

/** Date ISO → valeur d'un champ datetime-local en heure de Paris. */
export function isoToParisLocal(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return parts.replace(' ', 'T');
}
