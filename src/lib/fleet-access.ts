import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';

/**
 * Parc partagé : un membre peut accéder, en plus du sien, au parc d'un titulaire
 * de la formule Complet qui l'a invité. Le parc affiché se choisit dans l'espace
 * membre (cookie), et la base (RLS, private.fleet_role) revérifie chaque accès.
 */

export type FleetRole = 'owner' | 'collaborateur' | 'lecture';
export type FleetAccess = { ownerId: string; role: FleetRole; label: string };

export const FLEET_COOKIE = 'tc_parc';
/** Personnes invitées en plus du titulaire, formule Complet. */
export const FLEET_GUESTS_LIMIT = 2;

export const ROLE_LABELS: Record<Exclude<FleetRole, 'owner'>, string> = {
  collaborateur: 'Collaborateur',
  lecture: 'Lecture seule',
};

export const getFleetAccess = cache(async (): Promise<{ current: FleetAccess; fleets: FleetAccess[]; me: string } | null> => {
  const session = await getSession();
  if (!session) return null;
  const mine: FleetAccess = { ownerId: session.userId, role: 'owner', label: 'Mon parc' };
  const fleets: FleetAccess[] = [mine];
  try {
    const { data } = await (await createClient()).from('fleet_members').select('owner_id, role').eq('member_id', session.userId).eq('status', 'actif');
    const ownerIds = (data ?? []).map((r) => r.owner_id as string);
    if (ownerIds.length) {
      // Nom de l'exploitation du titulaire (lecture réservée au serveur) et formule toujours active.
      const { data: owners } = await createServiceClient().from('profiles').select('id, farm_name, full_name, plan, suspended').in('id', ownerIds);
      for (const r of data ?? []) {
        const o = (owners ?? []).find((x) => x.id === r.owner_id);
        if (!o || o.plan === 'free' || o.suspended) continue;
        fleets.push({ ownerId: o.id as string, role: r.role as FleetRole, label: (o.farm_name || o.full_name || 'Parc partagé') as string });
      }
    }
  } catch {
    /* table absente ou base indisponible : parc personnel seulement */
  }
  const chosen = (await cookies()).get(FLEET_COOKIE)?.value;
  const current = fleets.find((f) => f.ownerId === chosen) ?? mine;
  return { current, fleets, me: session.userId };
});

/** Rôle de la personne connectée sur le parc d'un titulaire donné (null : aucun accès). */
export async function roleOn(ownerId: string): Promise<FleetRole | null> {
  const access = await getFleetAccess();
  return access?.fleets.find((f) => f.ownerId === ownerId)?.role ?? null;
}
